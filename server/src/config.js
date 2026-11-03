// Central configuration. All overridable via environment variables.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  // HMAC secret for signing JWTs. MUST be overridden in production.
  jwtSecret: process.env.JWT_SECRET || "stockflow-dev-secret-change-me",
  jwtTtlSeconds: Number(process.env.JWT_TTL || 60 * 60 * 8), // 8h
  // Login rate limiting (spec: max 5 failed attempts / 15 min).
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  },
  // JSON file store location.
  dataFile: process.env.DATA_FILE || path.join(__dirname, "..", "data", "db.json"),
  // CORS allowlist. "*" for dev.
  corsOrigin: process.env.CORS_ORIGIN || "*",
  // Seconds between simulated real-time activity broadcasts.
  wsHeartbeatMs: 25000,
};
