'use strict';
// Per-site test for graana (Graana). Run: node tests/sites/graana.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('graana').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
