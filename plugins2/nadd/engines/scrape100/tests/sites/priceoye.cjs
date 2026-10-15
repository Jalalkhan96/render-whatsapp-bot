'use strict';
// Per-site test for priceoye (PriceOye). Run: node tests/sites/priceoye.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('priceoye').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
