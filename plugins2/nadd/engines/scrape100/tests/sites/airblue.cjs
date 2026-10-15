'use strict';
// Per-site test for airblue (Airblue). Run: node tests/sites/airblue.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('airblue').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
