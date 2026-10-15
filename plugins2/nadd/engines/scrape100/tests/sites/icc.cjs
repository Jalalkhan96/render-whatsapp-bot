'use strict';
// Per-site test for icc (ICC). Run: node tests/sites/icc.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('icc').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
