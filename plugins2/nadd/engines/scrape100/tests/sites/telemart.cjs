'use strict';
// Per-site test for telemart (Telemart). Run: node tests/sites/telemart.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('telemart').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
