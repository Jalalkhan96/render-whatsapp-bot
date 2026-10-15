'use strict';
// Per-site test for arstechnica (Ars Technica). Run: node tests/sites/arstechnica.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('arstechnica').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
