import readline from 'node:readline';
import { Writable } from 'node:stream';
import { getConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { hashPassword } from '../server/auth.js';
import { startupErrorMessage } from '../server/startup-error.js';

// Suppress terminal echo while passwords are entered. No credentials in shell arguments.
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
const question = (prompt, secret = false) =>
  new Promise((resolve) => {
    process.stdout.write(prompt);
    muted = secret;
    rl.question('', (value) => {
      muted = false;
      if (secret) process.stdout.write('\n');
      resolve(value);
    });
  });
let client;
try {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
  const email = (await question('Admin email: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error('Enter a valid email address.');
  const password = await question('Password (at least 12 characters): ', true);
  if (password.length < 12 || password.length > 200)
    throw new Error('Use a password between 12 and 200 characters.');
  if (password !== (await question('Confirm password: ', true)))
    throw new Error('Passwords do not match.');
  const connection = await connectDatabase(getConfig());
  client = connection.client;
  const admins = connection.db.collection('admins');
  const existing = await admins.findOne({ email });
  const reset = process.argv.includes('--reset');
  if (existing && !reset)
    throw new Error(
      'That admin already exists. Use npm run admin:create -- --reset to reset its password.',
    );
  const passwordHash = await hashPassword(password);
  if (existing) {
    await admins.updateOne(
      { _id: existing._id },
      { $set: { passwordHash, updatedAt: new Date() } },
    );
    await connection.db.collection('sessions').deleteMany({ adminId: existing._id });
  } else await admins.insertOne({ email, passwordHash, createdAt: new Date() });
  console.log(
    existing
      ? 'Password reset. Existing sessions have been revoked.'
      : 'Admin created. Sign in at /admin.html.',
  );
} catch (error) {
  console.error(
    error.message.startsWith('Run ') ||
      error.message.startsWith('Enter ') ||
      error.message.startsWith('Use ') ||
      error.message.startsWith('Passwords ') ||
      error.message.startsWith('That ') ||
      error.message.startsWith('Set ')
      ? error.message
      : startupErrorMessage(error),
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await client?.close();
}
