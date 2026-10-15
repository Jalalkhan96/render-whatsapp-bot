'use strict';
// Per-site test for nike (Nike). Run: node tests/sites/nike.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('nike').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
