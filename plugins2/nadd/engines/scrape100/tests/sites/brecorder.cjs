'use strict';
// Per-site test for brecorder (Business Recorder). Run: node tests/sites/brecorder.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('brecorder').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
