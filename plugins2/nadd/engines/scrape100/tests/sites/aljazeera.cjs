'use strict';
// Per-site test for aljazeera (Al Jazeera). Run: node tests/sites/aljazeera.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('aljazeera').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
