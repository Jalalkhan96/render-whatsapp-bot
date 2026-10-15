'use strict';
// Per-site test for coinmarketcap (CoinMarketCap). Run: node tests/sites/coinmarketcap.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('coinmarketcap').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
