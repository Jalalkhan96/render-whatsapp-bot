'use strict';
// Per-site test for express (Express). Run: node tests/sites/express.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('express').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
