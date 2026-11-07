// Unit tests for the multipart parser and image storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.UPLOAD_DIR = path.join(__dirname, ".tmp-uploads-" + Date.now());

const { parseMultipart } = await import("../src/lib/multipart.js");
const { saveImage, serveUpload, UPLOAD_DIR } = await import("../src/lib/uploads.js");

// Build a fake multipart request stream. File bytes are passed as a "binary"
// string so they survive the Buffer round-trip intact.
function multipartReq(boundary, parts) {
  let body = "";
  for (const p of parts) {
    body += `--${boundary}\r\n`;
    if (p.filename) body += `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.contentType}\r\n\r\n`;
    else body += `Content-Disposition: form-data; name="${p.name}"\r\n\r\n`;
    body += p.value;
    body += "\r\n";
  }
  body += `--${boundary}--\r\n`;
  const req = Readable.from([Buffer.from(body, "binary")]);
  req.headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
  return req;
}

test("parses a text field and a PNG file part", async () => {
  // minimal valid PNG header bytes
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString("binary");
  const boundary = "----wmsTEST";
  const req = multipartReq(boundary, [
    { name: "note", value: "hello" },
    { name: "image", filename: "pic.png", contentType: "image/png", value: png },
  ]);
  const { fields, files } = await parseMultipart(req);
  assert.equal(fields.note, "hello");
  assert.ok(files.image);
  assert.equal(files.image.filename, "pic.png");
  assert.ok(files.image.data.length >= 8);
});

test("saveImage stores a png and serveUpload returns it", async () => {
  const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
  const saved = saveImage({ filename: "a.png", contentType: "image/png", data });
  assert.ok(saved.url.startsWith("/uploads/"));
  assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(saved.url))));

  // serve it
  let status, headers, body;
  const res = { writeHead(s, h) { status = s; headers = h; }, end(b) { body = b; } };
  serveUpload(res, path.basename(saved.url));
  assert.equal(status, 200);
  assert.equal(headers["Content-Type"], "image/png");
  assert.equal(body.length, data.length);
});

test("saveImage rejects non-image bytes", () => {
  assert.throws(() => saveImage({ filename: "x.png", contentType: "image/png", data: Buffer.from("not an image") }), /Unsupported/);
});

test("serveUpload is path-traversal safe", () => {
  let status;
  const res = { writeHead(s) { status = s; }, end() {} };
  serveUpload(res, "../../../etc/passwd");
  assert.equal(status, 404);
});

test.after(() => {
  try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch {}
});
