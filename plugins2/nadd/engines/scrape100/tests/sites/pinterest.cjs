'use strict';
// Per-site test for pinterest (Pinterest). Run: node tests/sites/pinterest.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('pinterest').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
