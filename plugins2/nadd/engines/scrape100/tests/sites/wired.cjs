'use strict';
// Per-site test for wired (Wired). Run: node tests/sites/wired.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('wired').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
