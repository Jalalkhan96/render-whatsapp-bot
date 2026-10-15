'use strict';
// Per-site test for apnews (AP News). Run: node tests/sites/apnews.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('apnews').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
