'use strict';
// Per-site test for quora (Quora). Run: node tests/sites/quora.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('quora').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
