'use strict';
// Per-site test for psx (Pakistan Stock Exchange). Run: node tests/sites/psx.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('psx').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
