# Google Images command-loader bridge

`plugin3/googleImageSearch.mjs` contains the implementation. The small
`plugins2/googleImageSearch.js` file is only a loader bridge because the
current myBOT command registry scans `plugins2` but does not scan `plugin3`.

Do not delete the bridge unless the core command loader is deliberately
updated to load `plugin3` modules itself.
