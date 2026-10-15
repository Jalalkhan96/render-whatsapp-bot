'use strict';
// Per-site test for huggingface (Hugging Face). Run: node tests/sites/huggingface.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('huggingface').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
