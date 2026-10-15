'use strict';
// Per-site test for shophive (ShopHive). Run: node tests/sites/shophive.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('shophive').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
