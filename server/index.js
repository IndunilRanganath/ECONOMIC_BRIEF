import { getConfig } from './config.js';
import { connectDatabase, importInitialPosts } from './database.js';
import { createApp } from './app.js';
import { startupErrorMessage } from './startup-error.js';
let client, server;
try {
  const config = getConfig();
  const connection = await connectDatabase(config); client = connection.client;
  await importInitialPosts(connection.db);
  const app = await createApp({ db: connection.db, config });
  server = app.listen(config.port, config.host, () => {
    console.log(`The Economic Brief: ${config.origin || `http://${config.host}:${config.port}`}`);
    console.log('Admin panel: /admin.html. Create your account with npm run admin:create.');
  });
  server.on('error', async () => { console.error('The server could not listen. Check HOST and PORT.'); await client.close(); process.exit(1); });
} catch (error) {
  console.error(startupErrorMessage(error));
  await client?.close(); process.exitCode = 1;
}
async function shutdown() { if (server) await new Promise(resolve => server.close(resolve)); await client?.close(); }
process.once('SIGINT', async () => { await shutdown(); process.exit(0); });
process.once('SIGTERM', async () => { await shutdown(); process.exit(0); });
