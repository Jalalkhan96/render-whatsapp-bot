'use strict';
// Per-site test for tribune (Pakistan Tribune). Run: node tests/sites/tribune.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('tribune').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
