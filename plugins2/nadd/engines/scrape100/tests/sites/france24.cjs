'use strict';
// Per-site test for france24 (France 24). Run: node tests/sites/france24.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('france24').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
