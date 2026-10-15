'use strict';
// Per-site test for pia (PIA). Run: node tests/sites/pia.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('pia').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
