'use strict';
// Per-site test for zong (Zong). Run: node tests/sites/zong.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('zong').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
