'use strict';
// Per-site test for tapmad (Tapmad). Run: node tests/sites/tapmad.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('tapmad').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
