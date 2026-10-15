'use strict';
// Per-site test for telenor (Telenor Pakistan). Run: node tests/sites/telenor.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('telenor').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
