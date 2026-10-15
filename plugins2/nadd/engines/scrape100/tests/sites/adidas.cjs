'use strict';
// Per-site test for adidas (Adidas). Run: node tests/sites/adidas.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('adidas').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
