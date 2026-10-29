import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'brief_admin';
export const SESSION_HOURS = 8;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  const expected = Buffer.from(key, 'hex');
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export function cookieToken(req) {
  return (
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(SESSION_COOKIE + '='))
      ?.slice(SESSION_COOKIE.length + 1) || ''
  );
}
export function cookieOptions(production) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_HOURS * 3600000,
  };
}
export async function createSession(db, adminId) {
  const token = randomBytes(32).toString('hex');
  const session = {
    _id: tokenHash(token),
    adminId,
    csrf: randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000),
  };
  await db.collection('sessions').insertOne(session);
  return { token, session };
}
export function authentication(db) {
  return async (req, res, next) => {
    const token = cookieToken(req);
    if (!/^[a-f0-9]{64}$/.test(token))
      return res.status(401).json({ error: 'Please sign in to continue.' });
    const session = await db
      .collection('sessions')
      .findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
    if (!session)
      return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    const admin = await db.collection('admins').findOne({ _id: session.adminId });
    if (!admin) return res.status(401).json({ error: 'Please sign in again.' });
    req.session = session;
    req.admin = admin;
    next();
  };
}
export function sameOrigin(config) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const expected = config.origin || `${req.protocol}://${req.get('host')}`;
    if (req.get('origin') !== expected)
      return res.status(403).json({ error: 'This request must come from the admin website.' });
    next();
  };
}
export function csrfProtection(req, res, next) {
  const submitted = Buffer.from(req.get('x-csrf-token') || '');
  const expected = Buffer.from(req.session.csrf);
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected))
    return res
      .status(403)
      .json({ error: 'Security token expired. Reload the admin panel and try again.' });
  next();
}
