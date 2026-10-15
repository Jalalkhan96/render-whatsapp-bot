'use strict';
// Per-site test for aliexpress (AliExpress). Run: node tests/sites/aliexpress.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('aliexpress').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
