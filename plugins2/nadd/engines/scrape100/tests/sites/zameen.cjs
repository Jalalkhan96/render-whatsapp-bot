'use strict';
// Per-site test for zameen (Zameen). Run: node tests/sites/zameen.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('zameen').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
