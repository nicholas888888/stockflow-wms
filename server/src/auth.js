// Authentication: login (with rate limiting), token verification, RBAC guards.
import { col, findById, get as storeGet } from "./lib/store.js";
import { verifyPassword, signToken, verifyToken } from "./lib/crypto.js";
import { HttpError } from "./lib/http.js";
import { config } from "./config.js";

// In-memory failed-attempt tracker keyed by username/email (resets on restart).
const attempts = new Map(); // key -> { count, firstTs, lockUntil }

export function loginRateState(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec) return { locked: false, remaining: config.login.maxAttempts };
  if (rec.lockUntil && now < rec.lockUntil) {
    return { locked: true, retryInMs: rec.lockUntil - now, remaining: 0 };
  }
  // window expired → reset
  if (now - rec.firstTs > config.login.windowMs) {
    attempts.delete(key);
    return { locked: false, remaining: config.login.maxAttempts };
  }
  return { locked: false, remaining: Math.max(0, config.login.maxAttempts - rec.count) };
}

function recordFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, firstTs: now, lockUntil: 0 };
  if (now - rec.firstTs > config.login.windowMs) {
    rec.count = 0;
    rec.firstTs = now;
    rec.lockUntil = 0;
  }
  rec.count += 1;
  if (rec.count >= config.login.maxAttempts) {
    rec.lockUntil = now + config.login.windowMs;
  }
  attempts.set(key, rec);
  return rec;
}

function clearFailures(key) {
  attempts.delete(key);
}

export function login({ identifier, password }) {
  if (!identifier || !password) throw new HttpError(400, "Username/email and password are required");
  const key = String(identifier).toLowerCase();

  const state = loginRateState(key);
  if (state.locked) {
    throw new HttpError(429, "Account temporarily locked due to too many failed attempts", {
      retryInMinutes: Math.ceil(state.retryInMs / 60000),
    });
  }

  const user = col("users").find(
    (u) => u.username.toLowerCase() === key || u.email.toLowerCase() === key
  );

  if (!user || !verifyPassword(password, user.password)) {
    const rec = recordFailure(key);
    const remaining = Math.max(0, config.login.maxAttempts - rec.count);
    if (rec.lockUntil) {
      throw new HttpError(429, "Too many failed attempts. Locked for 15 minutes.", { remaining: 0 });
    }
    throw new HttpError(401, "Invalid credentials", { attemptsRemaining: remaining });
  }

  if (user.status !== "Active") {
    throw new HttpError(403, "This account is inactive. Contact an administrator.");
  }

  clearFailures(key);
  const token = signToken({ sub: user.id, role: user.role, username: user.username });
  return { token, user: publicUser(user) };
}

export function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

/* ---------------- Middleware ---------------- */
// Returns the authenticated user or throws 401.
export function authenticate(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) throw new HttpError(401, "Missing or invalid token");
  const user = findById("users", payload.sub);
  if (!user) throw new HttpError(401, "User no longer exists");
  if (user.status !== "Active") throw new HttpError(403, "Account inactive");
  return user;
}

// Guard: require the user's role to have access to a given "page"/capability.
// Reads the live access matrix from the store so RBAC edits take effect.
export function requirePage(user, page) {
  const allowed = (storeGet().access || {})[user.role] || [];
  if (!allowed.includes(page)) {
    throw new HttpError(403, `Role '${user.role}' is not permitted to access '${page}'`);
  }
}

// Guard: require specific role(s).
export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "Insufficient role");
  }
}
