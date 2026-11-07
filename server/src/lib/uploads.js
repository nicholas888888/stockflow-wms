// File storage for uploaded images. Writes under server/uploads/ and serves them.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads");

const EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Validate by magic bytes so a renamed file can't masquerade as an image.
function sniff(buf) {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
  const head = buf.slice(0, 256).toString("utf8").trim();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

export function saveImage(file) {
  ensureDir();
  if (!file || !file.data || !file.data.length) throw new HttpError(400, "No file provided");
  // Trust the magic-byte sniff, not the client-declared content-type, so a
  // non-image can't be stored by lying about its MIME type.
  const detected = sniff(file.data);
  if (!detected || !EXT[detected]) throw new HttpError(415, "Unsupported or invalid image (png, jpg, gif, webp, svg)");
  const ext = EXT[detected];
  const name = Date.now().toString(36) + "-" + crypto.randomBytes(5).toString("hex") + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
  return { filename: name, url: "/uploads/" + name, size: file.data.length, contentType: detected };
}

// Serve a stored file by name (path-traversal safe).
export function serveUpload(res, name) {
  const safe = path.basename(name); // strip any directory components
  const full = path.join(UPLOAD_DIR, safe);
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) {
    res.writeHead(404); res.end("not found"); return;
  }
  const mime = MIME[path.extname(safe).toLowerCase()] || "application/octet-stream";
  const data = fs.readFileSync(full);
  res.writeHead(200, { "Content-Type": mime, "Content-Length": data.length, "Cache-Control": "public, max-age=86400" });
  res.end(data);
}
