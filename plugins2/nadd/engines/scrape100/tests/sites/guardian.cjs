'use strict';
// Per-site test for guardian (The Guardian). Run: node tests/sites/guardian.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('guardian').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
