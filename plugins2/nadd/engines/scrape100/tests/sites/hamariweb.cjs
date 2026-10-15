'use strict';
// Per-site test for hamariweb (Hamariweb). Run: node tests/sites/hamariweb.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('hamariweb').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
