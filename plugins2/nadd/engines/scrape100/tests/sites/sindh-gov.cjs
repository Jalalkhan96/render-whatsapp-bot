'use strict';
// Per-site test for sindh-gov (Sindh Government). Run: node tests/sites/sindh-gov.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('sindh-gov').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
