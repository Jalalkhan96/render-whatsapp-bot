'use strict';
// Per-site test for ary (ARY News). Run: node tests/sites/ary.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('ary').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
