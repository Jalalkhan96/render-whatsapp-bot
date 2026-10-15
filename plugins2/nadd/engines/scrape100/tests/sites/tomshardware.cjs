'use strict';
// Per-site test for tomshardware (Tom's Hardware). Run: node tests/sites/tomshardware.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('tomshardware').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
