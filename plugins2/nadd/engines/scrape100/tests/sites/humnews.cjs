'use strict';
// Per-site test for humnews (Hum News). Run: node tests/sites/humnews.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('humnews').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
