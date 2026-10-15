'use strict';
// Per-site test for espncricinfo (ESPNcricinfo). Run: node tests/sites/espncricinfo.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('espncricinfo').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
