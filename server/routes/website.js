import express from 'express';
import path from 'node:path';
import { ROOT } from '../config.js';
import { PUBLIC_PAGES, PUBLIC_DIRECTORIES } from '../public-files.js';

export function registerWebsiteRoutes(app, { media, config }) {
  app.get('/admin', (req, res) => res.redirect('/admin.html'));
  for (const file of PUBLIC_PAGES) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : '/' + file, (req, res) =>
      res.sendFile(path.join(ROOT, file)),
    );
  }
  for (const dir of PUBLIC_DIRECTORIES) {
    app.use('/' + dir, express.static(path.join(ROOT, dir), { dotfiles: 'deny', index: false }));
  }
  if (media.inMongo) {
    app.get('/uploads/:filename', (req, res, next) => media.serve(req, res, next).catch(next));
  } else {
    app.use(
      '/uploads',
      express.static(config.uploadDir, {
        dotfiles: 'deny',
        index: false,
        setHeaders: (res) => {
          res.set('X-Content-Type-Options', 'nosniff');
        },
      }),
    );
  }
  app.use((req, res) => res.status(404).type('text').send('Page not found.'));
}
