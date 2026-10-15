'use strict';
// Per-site test for androidauthority (Android Authority). Run: node tests/sites/androidauthority.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('androidauthority').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
