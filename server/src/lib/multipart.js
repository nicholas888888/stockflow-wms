// Minimal multipart/form-data parser (stdlib only). Handles file + field parts.
// Good enough for single-image uploads; not a full RFC implementation.
import { HttpError } from "./http.js";

export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers["content-type"] || "";
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!ct.startsWith("multipart/form-data") || !m) {
      reject(new HttpError(400, "Expected multipart/form-data"));
      return;
    }
    const boundary = "--" + (m[1] || m[2]).trim();
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { // 8MB cap
        reject(new HttpError(413, "File too large (max 8MB)"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(splitParts(Buffer.concat(chunks), boundary));
      } catch (e) {
        reject(new HttpError(400, "Malformed multipart body"));
      }
    });
  });
}

function splitParts(buf, boundary) {
  const fields = {};
  const files = {};
  const bBuf = Buffer.from(boundary);
  let start = buf.indexOf(bBuf);
  if (start < 0) return { fields, files };
  start += bBuf.length;

  while (start < buf.length) {
    // after boundary: either "--" (end) or CRLF then headers
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break; // "--" terminator
    // skip leading CRLF
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;

    const headerEnd = buf.indexOf("\r\n\r\n", start);
    if (headerEnd < 0) break;
    const headerStr = buf.slice(start, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;

    const next = buf.indexOf(bBuf, bodyStart);
    const bodyEnd = next < 0 ? buf.length : next - 2; // strip trailing CRLF
    const body = buf.slice(bodyStart, bodyEnd);

    const nameM = /name="([^"]+)"/i.exec(headerStr);
    const fileM = /filename="([^"]*)"/i.exec(headerStr);
    const typeM = /content-type:\s*([^\r\n]+)/i.exec(headerStr);
    const name = nameM ? nameM[1] : null;

    if (name) {
      if (fileM && fileM[1]) {
        files[name] = { filename: fileM[1], contentType: typeM ? typeM[1].trim() : "application/octet-stream", data: body };
      } else {
        fields[name] = body.toString("utf8");
      }
    }
    if (next < 0) break;
    start = next + bBuf.length;
  }
  return { fields, files };
}
