'use strict';
// Per-site test for dawn (Dawn). Run: node tests/sites/dawn.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('dawn').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
