'use strict';
// Per-site test for etsy (Etsy). Run: node tests/sites/etsy.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('etsy').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
