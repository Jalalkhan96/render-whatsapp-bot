'use strict';
// Per-site test for macrumors (MacRumors). Run: node tests/sites/macrumors.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('macrumors').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
