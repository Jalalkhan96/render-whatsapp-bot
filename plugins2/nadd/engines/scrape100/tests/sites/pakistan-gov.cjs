'use strict';
// Per-site test for pakistan-gov (Pakistan Government). Run: node tests/sites/pakistan-gov.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('pakistan-gov').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
