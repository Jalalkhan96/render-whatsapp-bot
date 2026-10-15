'use strict';
// Per-site test for urdupoint (UrduPoint). Run: node tests/sites/urdupoint.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('urdupoint').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
