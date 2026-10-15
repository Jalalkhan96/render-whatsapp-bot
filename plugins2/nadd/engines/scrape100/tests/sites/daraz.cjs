'use strict';
// Per-site test for daraz (Daraz). Run: node tests/sites/daraz.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('daraz').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
