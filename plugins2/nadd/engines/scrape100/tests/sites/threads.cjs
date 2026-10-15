'use strict';
// Per-site test for threads (Threads). Run: node tests/sites/threads.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('threads').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
