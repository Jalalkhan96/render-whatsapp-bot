'use strict';
// Per-site test for foodpanda (Foodpanda Pakistan). Run: node tests/sites/foodpanda.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('foodpanda').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
