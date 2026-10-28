import { getConfig } from '../server/config.js';
import { connectDatabase, importInitialPosts } from '../server/database.js';
import { createApp } from '../server/app.js';
import { startupErrorMessage } from '../server/startup-error.js';

// Reuse the connection pool and Express app across warm function invocations.
let runtime;
async function initialize() {
  const config = getConfig();
  const { client, db } = await connectDatabase(config);
  try {
    await importInitialPosts(db);
    return { client, app: await createApp({ db, config }) };
  } catch (error) { await client.close(); throw error; }
}
export default async function handler(req, res) {
  try {
    if (!runtime) runtime = initialize().catch(error => { runtime = undefined; throw error; });
    const { app } = await runtime;
    return app(req, res);
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    res.end(JSON.stringify({ error: startupErrorMessage(error) }));
  }
}

// Lifecycle hook for integration tools that explicitly tear down the warm runtime.
export async function closeRuntime() {
  const active = runtime;
  runtime = undefined;
  if (active) { const { client } = await active; await client.close(); }
}
