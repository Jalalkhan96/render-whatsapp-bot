'use strict';
// Per-site test for sastaticket (Sastaticket). Run: node tests/sites/sastaticket.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('sastaticket').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
