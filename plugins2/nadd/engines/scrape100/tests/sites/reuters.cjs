'use strict';
// Per-site test for reuters (Reuters). Run: node tests/sites/reuters.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('reuters').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
