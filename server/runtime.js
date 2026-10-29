import { getConfig } from './config.js';
import { connectDatabase, importInitialPosts } from './database.js';
import { createApp } from './app.js';

// Both hosting entry points own the returned client and must close it on teardown.
export async function createRuntime() {
  const config = getConfig();
  const { client, db } = await connectDatabase(config);

  try {
    await importInitialPosts(db);
    const app = await createApp({ db, config });
    return { client, app, config };
  } catch (error) {
    await client.close();
    throw error;
  }
}
