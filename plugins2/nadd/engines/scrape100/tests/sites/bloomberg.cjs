'use strict';
// Per-site test for bloomberg (Bloomberg). Run: node tests/sites/bloomberg.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('bloomberg').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
