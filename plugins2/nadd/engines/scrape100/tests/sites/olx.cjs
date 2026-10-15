'use strict';
// Per-site test for olx (OLX Pakistan). Run: node tests/sites/olx.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('olx').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
