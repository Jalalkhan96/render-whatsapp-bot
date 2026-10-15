'use strict';
// Per-site test for dunya (Dunya News). Run: node tests/sites/dunya.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('dunya').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
