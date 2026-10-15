'use strict';
// Per-site test for nytimes (New York Times). Run: node tests/sites/nytimes.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('nytimes').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
