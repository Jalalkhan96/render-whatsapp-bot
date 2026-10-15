'use strict';
// Per-site test for nadra (NADRA). Run: node tests/sites/nadra.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('nadra').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
