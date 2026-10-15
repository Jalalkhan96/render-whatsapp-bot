# ABIX Font Plugin — Direct Turso Catalog

The active command plugin is `plugins/font-downloader.js`; the selection-link command is `plugins/fd.js`. Both use `lib/fontCatalogDb.js` to read the existing Turso `fonts` table directly. No Vercel deployment or separate API server is involved.

The stale `plugins2/font-downloader-loader.js` bridge is intentionally inert. It no longer loads the old DaFont scraping implementation from `plugin3/`.

## Required environment

Add to the bot's existing `.env` file:

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_actual_turso_auth_token
TURSO_FONTS_TABLE=fonts
```

The expected table columns are `id`, `name`, `author`, `license`, `category`, `url`, `download_url`, and `source`.

## Commands

- `-font` / `-fontmenu`
- `-font random [language]`
- `-font search <name>` / `-font find <name>`
- `-font dl <name|id>` / `-font info <name|id>`
- `-font type <type>` / `-font types`
- `-font lang <language>`
- `-font urdu`, `-font urdu random`, `-font urdu <name>`
- `-font license <free|personal|pd|donation|shareware|demo>`
- `-font source <site> <query>`, `-font sites`, `-font stats`
- `-fd 1`, `-fd 1,3,5`, `-fd all`
- Combined catalog: `-fontdb <name>`
- Site searches: `-dafontdb`, `-googlefontsdb`, `-fontsharedb`, `-fontsquirreldb`, `-freefontsdb`, `-abstractfontsdb`, `-fontspacedb`, `-urbanfontsdb`, `-wfontsdb`
- Catalog utilities: `-fontsource <site> <query>`, `-fontsites`, `-fontstats`, `-fontget <id>`

Searches update the per-chat selection cache so `-fd` can return links from the last result list. The bot sends saved URLs rather than proxying complete font archives through its host, reducing RAM and disk usage. Check font licensing at the source before commercial use.

## Install and test

1. Merge the patch into the bot root; do not overwrite the actual `.env` with `.env.example`.
2. Add the credentials above using your own Turso values.
3. Run `npm install` once so the existing lockfile is updated for `@libsql/client`, then restart with `npm start`.
4. Run `node tests/font-catalog-bot.test.cjs` for command integration checks. Live database tests require valid credentials.
