import { startupErrorMessage } from './startup-error.js';
let client, server;
try {
  // Keep imports inside the guard so local startup also diagnoses load failures.
  const { createRuntime } = await import('./runtime.js');
  const runtime = await createRuntime();
  client = runtime.client;
  const { app, config } = runtime;
  server = app.listen(config.port, config.host, () => {
    console.log(`The Economic Brief: ${config.origin || `http://${config.host}:${config.port}`}`);
    console.log('Admin panel: /admin.html. Create your account with npm run admin:create.');
  });
  server.on('error', async () => {
    console.error('The server could not listen. Check HOST and PORT.');
    await client.close();
    process.exit(1);
  });
} catch (error) {
  console.error(startupErrorMessage(error));
  await client?.close();
  process.exitCode = 1;
}
async function shutdown() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await client?.close();
}
process.once('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});
process.once('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
