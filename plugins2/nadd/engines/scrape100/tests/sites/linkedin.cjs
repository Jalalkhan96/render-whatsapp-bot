'use strict';
// Per-site test for linkedin (LinkedIn). Run: node tests/sites/linkedin.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('linkedin').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
