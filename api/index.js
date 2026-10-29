import { startupErrorMessage } from '../server/startup-error.js';

// Reuse the connection pool and Express app across warm function invocations.
let runtimePromise;
async function initialize() {
  // Load dependencies inside the guarded initialization. Module-load failures
  // otherwise crash the function before handler() can return a JSON diagnostic.
  const { createRuntime } = await import('../server/runtime.js');
  return createRuntime();
}
export default async function handler(req, res) {
  try {
    if (!runtimePromise) {
      runtimePromise = initialize().catch((error) => {
        runtimePromise = undefined;
        // Driver messages/stacks may contain credentials; log only safe categories.
        console.error('API initialization failed', { name: error.name, code: error.code });
        throw error;
      });
    }
    const { app } = await runtimePromise;
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
  const active = runtimePromise;
  runtimePromise = undefined;
  if (active) {
    const { client } = await active;
    await client.close();
  }
}
