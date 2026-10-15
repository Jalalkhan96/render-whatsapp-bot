'use strict';
// Per-site test for thenews (The News). Run: node tests/sites/thenews.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('thenews').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
