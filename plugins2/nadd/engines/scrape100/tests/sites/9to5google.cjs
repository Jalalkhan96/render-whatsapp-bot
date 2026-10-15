'use strict';
// Per-site test for 9to5google (9to5Google). Run: node tests/sites/9to5google.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('9to5google').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
