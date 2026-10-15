'use strict';
// Per-site test for reddit (Reddit). Run: node tests/sites/reddit.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('reddit').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
