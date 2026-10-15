'use strict';
// Per-site test for cnbc (CNBC). Run: node tests/sites/cnbc.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('cnbc').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
