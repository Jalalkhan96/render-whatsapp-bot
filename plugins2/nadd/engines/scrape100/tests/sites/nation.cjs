'use strict';
// Per-site test for nation (The Nation). Run: node tests/sites/nation.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('nation').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
