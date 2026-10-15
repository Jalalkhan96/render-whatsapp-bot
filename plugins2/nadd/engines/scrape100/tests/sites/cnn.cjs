'use strict';
// Per-site test for cnn (CNN). Run: node tests/sites/cnn.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('cnn').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
