'use strict';
// Per-site test for dominos (Domino's Pakistan). Run: node tests/sites/dominos.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('dominos').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
