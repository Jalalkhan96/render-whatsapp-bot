'use strict';
// Per-site test for geo (Geo News). Run: node tests/sites/geo.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('geo').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
