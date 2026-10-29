import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../server/config.js';

test('Vercel runtime options load the sanitizer when require(ESM) starts disabled', () => {
  const deployment = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const options = deployment.env.NODE_OPTIONS.split(/\s+/);
  // Reproduce the platform default, then apply the configured opt-in.
  const child = spawnSync(
    process.execPath,
    [
      '--no-experimental-require-module',
      ...options,
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { validatePost } from './server/posts.js';
      const post = validatePost({
        title: 'Runtime check', slug: 'runtime-check', summary: 'Runtime check',
        author: 'Editor', category: 'Business', format: 'article', visibility: 'draft',
        image: 'assets/images/business.jpg', alt: 'Business', tags: [], sources: [],
        body: '<p onclick="alert(1)">Safe text</p><script>alert(2)</script>',
      });
      assert.equal(post.body, '<p>Safe text</p>');
    `,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: deployment.env.NODE_OPTIONS },
    },
  );
  assert.equal(child.status, 0, child.stderr || child.error?.message);
});
