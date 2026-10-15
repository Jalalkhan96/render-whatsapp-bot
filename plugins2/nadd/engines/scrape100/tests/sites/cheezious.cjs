'use strict';
// Per-site test for cheezious (Cheezious). Run: node tests/sites/cheezious.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('cheezious').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
