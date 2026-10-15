'use strict';
// Per-site test for dw (DW). Run: node tests/sites/dw.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('dw').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
