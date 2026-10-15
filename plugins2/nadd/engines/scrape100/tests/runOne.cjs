'use strict';
/* Run one site test: node tests/runOne.cjs <site-id> */
const { runSiteTest } = require('./siteTest.cjs');
const id = process.argv[2];
if (!id) { console.log('usage: node tests/runOne.cjs <site-id>'); process.exit(2); }
runSiteTest(id).then(r => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.status === 'failed' ? 1 : 0);
});
