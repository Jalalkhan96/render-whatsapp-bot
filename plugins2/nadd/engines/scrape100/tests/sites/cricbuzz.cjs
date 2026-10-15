'use strict';
// Per-site test for cricbuzz (Cricbuzz). Run: node tests/sites/cricbuzz.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('cricbuzz').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
