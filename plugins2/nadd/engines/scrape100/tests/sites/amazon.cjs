'use strict';
// Per-site test for amazon (Amazon). Run: node tests/sites/amazon.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('amazon').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
