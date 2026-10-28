import test from 'node:test';
import assert from 'node:assert/strict';
import { getConfig } from '../server/config.js';
import { startupErrorMessage } from '../server/startup-error.js';

test('placeholder Atlas credentials fail before a connection is attempted', () => {
  assert.throws(() => getConfig({ MONGODB_URI:'mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/' }), /still contains template placeholders/);
  assert.throws(() => getConfig({ MONGODB_URI:'mongodb+srv://editor:<db_password>@cluster.example/' }), /template placeholders/);
});
test('valid local and Atlas configuration preserves the connection string', () => {
  for (const uri of ['mongodb://127.0.0.1:27017','mongodb+srv://editor:encoded%40password@cluster.example/']) {
    const config=getConfig({MONGODB_URI:uri,APP_ORIGIN:'http://localhost:3000'});
    assert.equal(config.uri,uri); assert.equal(config.origin,'http://localhost:3000');assert.equal(config.port,3000);
  }
});
test('invalid website configuration has clear errors', () => {
  const base={MONGODB_URI:'mongodb://127.0.0.1:27017'};
  assert.throws(()=>getConfig({}),/Set MONGODB_URI/);
  assert.throws(()=>getConfig({...base,APP_ORIGIN:'invalid'}),/APP_ORIGIN/);
  assert.throws(()=>getConfig({...base,PORT:'invalid'}),/PORT/);
  assert.throws(()=>getConfig({...base,NODE_ENV:'production',APP_ORIGIN:'http://localhost:3000'}),/HTTPS/);
});
test('startup errors explain authentication without leaking driver credentials', () => {
  const error=Object.assign(new Error('authentication failed for mongodb+srv://secret-user:secret-password@private.example'),{name:'MongoServerError',code:8000});
  const message=startupErrorMessage(error);
  assert.match(message,/authentication failed/);assert(!message.includes('secret-user'));assert(!message.includes('secret-password'));assert(!message.includes('private.example'));
});
test('startup errors distinguish DNS, permissions, and network access', () => {
  assert.match(startupErrorMessage({code:'ENOTFOUND'}),/hostname lookup/);
  assert.match(startupErrorMessage({code:13}),/read\/write permissions/);
  assert.match(startupErrorMessage({name:'MongoServerSelectionError'}),/Network Access/);
});
