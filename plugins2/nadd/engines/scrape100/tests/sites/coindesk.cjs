'use strict';
// Per-site test for coindesk (CoinDesk). Run: node tests/sites/coindesk.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('coindesk').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
