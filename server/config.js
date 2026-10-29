import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
export function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const vercel = env.VERCEL === '1';
  const uploadStorage = env.UPLOAD_STORAGE || (vercel ? 'mongodb' : 'filesystem');
  if (!['mongodb', 'filesystem'].includes(uploadStorage))
    throw new ConfigurationError('UPLOAD_STORAGE must be mongodb or filesystem.');
  if (vercel && uploadStorage !== 'mongodb')
    throw new ConfigurationError(
      'Vercel requires UPLOAD_STORAGE=mongodb for durable image uploads.',
    );
  if (!env.MONGODB_URI)
    throw new ConfigurationError(
      'Set MONGODB_URI in .env to your MongoDB Atlas connection string.',
    );
  if (/DATABASE_USER|ENCODED_PASSWORD|YOUR_CLUSTER|<[^>]+>/.test(env.MONGODB_URI)) {
    throw new ConfigurationError(
      'MONGODB_URI in .env still contains template placeholders. Replace DATABASE_USER, ENCODED_PASSWORD, and YOUR_CLUSTER (or angle-bracket placeholders) with your Atlas database connection details.',
    );
  }
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    throw new ConfigurationError('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  let origin = '';
  if (env.APP_ORIGIN) {
    try {
      const url = new URL(env.APP_ORIGIN);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
      origin = url.origin;
    } catch {
      throw new ConfigurationError('APP_ORIGIN must be a valid HTTP or HTTPS website origin.');
    }
  }
  if (production && !origin.startsWith('https://'))
    throw new ConfigurationError('Production requires an HTTPS APP_ORIGIN.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ConfigurationError('PORT must be a whole number from 1 to 65535.');
  return {
    vercel,
    uploadStorage,
    maxUploadBytes: (vercel ? 4 : 8) * 1024 * 1024,
    uri: env.MONGODB_URI,
    dbName: env.MONGODB_DB || 'economic_brief',
    production,
    origin,
    host: env.HOST || '127.0.0.1',
    port,
    uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
    trustProxy: vercel || env.TRUST_PROXY === '1',
  };
}
