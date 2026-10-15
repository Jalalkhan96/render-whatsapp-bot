'use strict';
// Per-site test for bbc (BBC). Run: node tests/sites/bbc.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('bbc').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
