'use strict';
// Per-site test for samaa (Samaa). Run: node tests/sites/samaa.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('samaa').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
