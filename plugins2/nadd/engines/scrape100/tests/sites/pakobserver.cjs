'use strict';
// Per-site test for pakobserver (Pakistan Observer). Run: node tests/sites/pakobserver.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('pakobserver').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
