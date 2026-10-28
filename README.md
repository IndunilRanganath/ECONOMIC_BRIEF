# The Economic Brief

An image-led publishing site with a password-protected admin panel and MongoDB storage. The public frontend remains HTML, CSS, and vanilla JavaScript. The admin panel runs on a Node.js/Express backend; there is no frontend build step.

## Run with MongoDB Atlas

Requires Node.js 22.9+ (Node 24 recommended), npm, and your MongoDB Atlas database.

1. In Atlas, create a deployment, create a database user with access to your `economic_brief` database, and allow your server/development IP under Network Access. Copy the **Drivers / Node.js connection string**. Follow the [official Atlas connection guide](https://www.mongodb.com/docs/drivers/node/current/get-started/).
2. From this project folder:

   ```sh
   npm install
   cp .env.example .env
   ```

3. Edit `.env` locally:

   ```dotenv
   MONGODB_URI=mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=economic_brief
   PORT=3000
   HOST=127.0.0.1
   APP_ORIGIN=http://localhost:3000
   NODE_ENV=development
   UPLOAD_DIR=uploads
   TRUST_PROXY=0
   ```

   Replace the Atlas placeholders. URL-encode special characters in the database password. Never paste credentials into browser scripts, commit `.env`, or share it in chat. `.env` is ignored by Git. A local MongoDB connection also works, e.g. `mongodb://127.0.0.1:27017`.

4. Create your admin account:

   ```sh
   npm run admin:create
   ```

   Enter your email and a password of at least 12 characters. Password entry is hidden. The stored password is hashed with scrypt. There is no default account and no public signup route.

5. Start the website:

   ```sh
   npm start
   ```

6. Open **http://localhost:3000** and **http://localhost:3000/admin.html**. Use the exact origin configured in `.env` when signing in. `/admin` also redirects to the panel. A Publishing desk link is available in the public footer.

Your Atlas connection has not been configured by this implementation. Tests use a separate temporary local MongoDB instance and do not access your Atlas account.

## If startup fails

- **Template placeholders:** `.env.example` is a template. In your real `.env`, replace `DATABASE_USER`, `ENCODED_PASSWORD`, and `YOUR_CLUSTER` with the database username, URL-encoded database password, and exact Atlas cluster hostname. The server now rejects unchanged placeholders before attempting a connection.
- **Authentication failed:** use your Atlas **database user** credentials, not your Atlas account login or the website admin email/password. Check Database Access in Atlas and URL-encode special characters in the password.
- **Hostname lookup failed:** copy the cluster's Drivers connection string again and check the hostname.
- **Network access:** allow this computer/server's IP in Atlas Network Access and confirm the cluster is available.
- **Access denied:** grant the database user read/write access to the database named by `MONGODB_DB`.

Keep the complete connection string in `.env`; do not paste it into logs or chat. Startup reports safe diagnostic categories without displaying driver connection details.

## What the admin panel does

- Sign in/out using an HTTP-only, SameSite Strict cookie. Sessions expire after eight hours.
- Search posts and filter by published/draft status.
- Create, edit, publish, unpublish, and remove posts.
- Manage image stories, quick facts, and long articles.
- Upload a main image and up to 12 gallery images, or select an existing asset path.
- Edit headline, slug, introduction, HTML body, key takeaway, image descriptions/credits, topic, tags, byline, dates, sources, feed priority, and editorial/demo status.
- Preview the image and text while editing. Open a saved published post on the public website.
- Confirm deletions and detect stale edits from another browser tab.

New posts start as **drafts**. Choose Published and save to make them public. Saving changes to a published post updates the public API immediately; refresh an already-open public page to see them. Draft database records never appear in the public API.

The Featured lead story option on a published post replaces the previous published lead selection. Feed priority controls ordering: higher numbers come first. Publication and update dates are optional; use accurate dates rather than inventing them. Changing a slug changes the public URL; automatic redirects are not implemented.

## Data and initial import

MongoDB is the live source of truth when using the Node server. Collections:

- `posts`: content, publication status, metadata, and revision numbers.
- `admins`: administrator emails and password hashes.
- `sessions`: hashed session tokens, CSRF tokens, admin references, and expiry times. Expired sessions are rejected immediately; MongoDB also has a TTL cleanup index.
- `migrations`: the initial JSON import marker.

On the first server start, records from `data/articles.json` are imported with their full content intact. Existing JSON entries are visible publicly as they were before this backend was added; their educational/review labels remain. The import is marked complete, so deleting all posts does **not** re-import them on restart. Editing the original JSON after this migration does not change MongoDB posts. Use the admin panel for live content.

Post body HTML is sanitized on admin saves. Scripts, event handlers, unsafe links, and unsupported markup are removed. Plain text is converted to paragraphs. Only known post fields are accepted; slugs are unique. Source URLs must use HTTP(S). Existing imported JSON is trusted project-authored content.

## Images and storage

Uploads accept JPEG, PNG, and WebP images up to **8 MB per file**, with file signatures checked on the server. SVG uploads are rejected; existing project-authored SVG graphics in `assets/images/` remain supported.

Images are stored in `UPLOAD_DIR` and referenced by path in MongoDB; image binaries are not stored in MongoDB. The admin route requires authentication and a CSRF token for uploads. Filenames are generated by the server. Uploads are public assets once stored, including images attached to drafts; **do not upload confidential images**. Draft protection applies to post records, not uploaded file URLs.

Removing a post does not delete its images, because other posts may reference them. Unattached/retained images require separate maintenance. Back up **both MongoDB and the upload directory**. On a host with temporary filesystem storage, attach a persistent volume or implement durable object storage before using uploads in production. Deleting or redeploying without persistent storage can lose uploaded images even though MongoDB post records remain.

`imageFit: "contain"` preserves news graphics and text in feed previews; `cover` crops photographs to fill their card. The reading page and full-image viewer always show the whole image. Additional gallery images support captions, arrow-key navigation, Escape, and returning keyboard focus to the opening control.

## Development and tests

```sh
npm run dev
npm test
```

Development uses Node's built-in watch mode. Tests use the real MongoDB driver with an isolated `mongodb-memory-server` instance, not your Atlas database. The first test run downloads a MongoDB binary into a temporary cache and requires network access. The test suite checks authentication, CSRF/origin protection, private-route denial, image uploads, validation, sanitized content, unique slugs, draft/public separation, optimistic updates, deletion, logout, and migration behavior.

Browser checks and verification limits are recorded in `VALIDATION.md`.

To reset an admin password or revoke its existing sessions:

```sh
npm run admin:create -- --reset
```

Enter the existing admin email and the new password. This command requires trusted terminal and database access. It also creates the account if the email is new.

## Static preview still works

Opening `index.html` directly continues to use `js/articles-local.js`. A separate static HTTP server without the API falls back to `data/articles.json` only when `/api/posts` returns 404. If the live backend reports an error, the site displays a load error rather than silently showing stale/deleted JSON content.

Static preview does **not** reflect admin/MongoDB changes. The admin panel requires the Node server. To update a manually edited static JSON snapshot, run:

```sh
python3 scripts/sync-local-data.py
```

This optional Python helper is unrelated to the live MongoDB publishing workflow.

## Project structure

```text
admin.html                      Admin sign-in, post list, and editor
index.html                      Image-led public homepage
article.html                    Article/image/fact reader
category.html, search.html      Topic and format-aware browsing
about.html, contact.html        Information pages
privacy.html, editorial-policy.html
css/style.css, css/admin.css    Publication and admin styles
js/articles.js                  Live API / static data loader
js/main.js                      Shared public UI, filters, forms
js/article-page.js              Reader, TOC, sharing, image viewer
js/admin.js                     Authenticated CRUD editor
server/config.js                Environment configuration
server/database.js              MongoDB connection, indexes, import
server/auth.js                  Passwords, sessions, CSRF, origins
server/posts.js                 Post validation and HTML sanitization
server/app.js                   API routes, uploads, static allowlist
server/index.js                 Startup and graceful shutdown
scripts/create-admin.js         Interactive admin creation/reset
scripts/sync-local-data.py      Optional direct-file snapshot helper
data/articles.json              Initial content and static preview
js/articles-local.js            Generated direct-file snapshot
assets/images/                  Local photographs and fact graphics
uploads/                        Persistent uploaded image files
.env.example                    Atlas/server configuration template
tests/admin.test.js             Real MongoDB integration checks
```

## Brand, content, and editorial status

Change colors, fonts, spacing, and widths in `css/style.css`. Change the publication configuration and header/footer brand lockups in `js/main.js`; also update the admin brand markup, HTML metadata, and favicon for a complete rebrand.

The supplied article “Who Are the Leading Economic Experts in 2026?” is preserved in full. It remains marked for editorial review: its current affiliations and October 2026 forecasts were not independently verified during development. Educational sample articles and three original fact graphics are labelled demonstrations. Do not remove those labels until you replace or approve the content. No author credentials, reporting history, or investment returns have been invented.

Photographs are local illustrative assets originally retrieved from Unsplash endpoints: `photo-1486406146926-c627a92ad1ab`, `photo-1444653614773-995cb1ef9efa`, `photo-1451187580459-43490279c0fa`, `photo-1460925895917-afdab827c52f`. Review rights and provenance for your production use.

## Production setup

Deploy to a **Node.js-capable host**, not static-only hosting. Configure your actual Atlas URI and database, exact HTTPS `APP_ORIGIN`, `NODE_ENV=production`, host/port, and persistent upload storage in the host's environment. Set `HOST=0.0.0.0` when required by the provider. If the app is behind exactly one trusted reverse proxy, set `TRUST_PROXY=1`; otherwise leave it off. Production cookies are Secure and require HTTPS. Do not publish development `.env` files or use test credentials.

The application uses secure headers, password hashing, same-origin mutation checks, CSRF tokens, login/upload rate limits, a static-file allowlist, and input validation. Administrative account recovery is via the trusted CLI. Email-based password reset, roles, 2FA, and audit-history features are not implemented.

Set real canonical/social URLs in each HTML page and `BRIEF.productionOrigin`. Browser-rendered query-based metadata is still insufficient for social crawlers that do not execute JavaScript; use separately authored/pre-rendered per-post HTML or server rendering for production SEO. Prepare a real sitemap and robots configuration. Draft/review-pending content is excluded from publication JSON-LD as appropriate.

Newsletter and public contact forms remain explicit demonstrations: this backend adds publishing and administrator storage, not email delivery or subscriber storage. Connect those services separately and update privacy/operator/contact details before collecting public submissions.


## Typography and readability

The public website and publishing desk use locally hosted **Source Sans 3**, an open-source editorial sans serif from Adobe. Its SIL Open Font License is included in `assets/fonts/SourceSans3-LICENSE.md`. Normal and italic Latin/Latin Extended variable WOFF2 files are supplied with `font-display: swap` and system fallbacks; there are no external font requests at runtime. Other scripts use system fallback fonts.

Article body text is 20px on desktop, 19px on tablets, and 18px on phones, at 1.75 line height with a maximum reading width of 700px. Headlines use moderate tracking and clear weight differences. Feed descriptions are shown in full; summaries, metadata, form labels, navigation, and admin controls are larger and darker. Shared font/color tokens are at the top of `css/style.css`; role-specific reading sizes are in its editorial typography section. Admin adjustments are in `css/admin.css`.

Design references reviewed: [Business Insider articles](https://www.businessinsider.com/economy) and the [Financial Times homepage](https://www.ft.com/). The implementation uses its own open-source font and brand styling. Article text and database content are unchanged by this typography update.
