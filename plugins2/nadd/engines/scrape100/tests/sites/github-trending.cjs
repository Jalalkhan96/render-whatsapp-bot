'use strict';
// Per-site test for github-trending (GitHub Trending). Run: node tests/sites/github-trending.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('github-trending').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
