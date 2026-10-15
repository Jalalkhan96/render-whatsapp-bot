'use strict';
// Per-site test for techcrunch (TechCrunch). Run: node tests/sites/techcrunch.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('techcrunch').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
