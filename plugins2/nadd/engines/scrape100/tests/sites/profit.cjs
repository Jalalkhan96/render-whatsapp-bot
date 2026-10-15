'use strict';
// Per-site test for profit (Profit Pakistan Today). Run: node tests/sites/profit.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('profit').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
