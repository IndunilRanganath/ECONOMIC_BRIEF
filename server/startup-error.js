// Do not log driver messages: they can contain connection details.
export function startupErrorMessage(error) {
  if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_REQUIRE_ESM'].includes(error.code)) {
    return 'The API could not load a server dependency. Check Vercel Function logs and redeploy from the repository root with npm ci and the committed package-lock.json.';
  }
  if (error.name === 'ConfigurationError') return error.message;
  if (error.code === 18 || /authentication|auth failed/i.test(error.message || '')) {
    return 'MongoDB authentication failed. Check the Atlas database user and password in MONGODB_URI, and URL-encode special characters in the password. The database user is separate from your website admin login.';
  }
  if (['ENOTFOUND','ESERVFAIL'].includes(error.code)) return 'MongoDB hostname lookup failed. Copy the Drivers connection string from your Atlas cluster and check the cluster hostname in MONGODB_URI.';
  if (error.name === 'MongoParseError') return 'MONGODB_URI is not a valid MongoDB connection string. Copy the Atlas Drivers connection string and replace its credential placeholders.';
  if (error.code === 13) return 'MongoDB access denied. Give the configured Atlas database user read/write permissions for MONGODB_DB.';
  if (error.name === 'MongoServerSelectionError') return 'Could not reach MongoDB. Check Atlas Network Access for this computer’s IP, cluster availability, and your network connection.';
  return 'Startup failed. Check your MongoDB Atlas connection, database user, and network access in .env.';
}
