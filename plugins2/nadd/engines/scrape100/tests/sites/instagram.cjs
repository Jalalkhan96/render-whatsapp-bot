'use strict';
// Per-site test for instagram (Instagram). Run: node tests/sites/instagram.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('instagram').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
