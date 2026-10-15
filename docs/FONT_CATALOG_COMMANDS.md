# ABIX font catalog — direct Turso integration

This patch routes the existing `-font` and `-fd` commands to the Turso font table directly. There is no Vercel deployment or separate HTTP API. Source commands (`-dafontdb`, `-googlefontsdb`, etc.) share the same database helper.

## Install

1. Copy the ZIP files into the existing ABIX bot root, preserving the folders. Merge the `package.json` dependency instead of replacing any newer project metadata if your bot has changed since the supplied archive.
2. Add these three lines to the bot's existing `.env` using the credentials for your font database:

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_actual_turso_auth_token
TURSO_FONTS_TABLE=fonts
```

3. Run `npm install` once so the existing lockfile is updated for `@libsql/client`, then restart the bot:

```bash
npm install
npm start
```

The existing table is expected to contain `id`, `name`, `author`, `license`, `category`, `url`, `download_url`, and `source`. The plugin validates its table name and uses parameterized values for search input.

## Legacy commands kept working

- `-font` / `-fontmenu` — menu
- `-font random [language]`
- `-font search <name>` / `-font find <name>`
- `-font dl <name|id>` / `-font info <name|id>`
- `-font type <type>` / `-font types`
- `-font lang <language>`
- `-font urdu`, `-font urdu random`, `-font urdu <name>`
- `-font license <free|personal|pd|donation|shareware|demo>`
- `-font source <site> <query>`, `-font sites`, `-font stats`
- `-fd 1`, `-fd 1,3,5`, `-fd all`

`-fd` returns the database-saved download/page URLs for the selected rows instead of proxying files through the bot host. This avoids downloading potentially large archives into the bot's limited RAM/disk space.

## Catalog commands

- `-fontdb <name>` — combined search
- `-fontdb source <site> <name>` or `-fontsource <site> <name>`
- `-fontsites`, `-fontstats`, `-fontget <id>`
- `-dafontdb`, `-googlefontsdb`, `-fontsharedb`, `-fontsquirreldb`, `-freefontsdb`, `-abstractfontsdb`, `-fontspacedb`, `-urbanfontsdb`, `-wfontsdb`

## Local checks

Run `npm test` to execute the command-integration test suite. Live database requests require valid Turso credentials and were not run while preparing this patch.
