'use strict';
// Per-site test for tiktok (TikTok). Run: node tests/sites/tiktok.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('tiktok').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
