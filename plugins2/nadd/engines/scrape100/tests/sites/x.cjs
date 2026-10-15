'use strict';
// Per-site test for x (X). Run: node tests/sites/x.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('x').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
