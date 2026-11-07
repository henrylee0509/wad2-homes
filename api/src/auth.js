// Password hashing (scrypt) and signed login tokens, using only Node's crypto module.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

// The signing secret comes from SESSION_SECRET, or is generated once and kept in the database
export function getSecret(db) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let secret = db.getSetting("session_secret");
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    db.setSetting("session_secret", secret);
  }
  return secret;
}

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data, secret) => createHmac("sha256", secret).update(data).digest("base64url");

export function createToken(user, secret) {
  const payload = b64(JSON.stringify({ uid: user.id, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

export function readToken(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = sign(payload, secret);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// Express middleware: requires "Authorization: Bearer <token>"
export function requireAuth(db) {
  const secret = getSecret(db);
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const data = readToken(header.replace(/^Bearer\s+/i, ""), secret);
    const user = data && db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(data.uid);
    if (!user) return res.status(401).json({ error: "Please log in again." });
    req.user = user;
    next();
  };
}
