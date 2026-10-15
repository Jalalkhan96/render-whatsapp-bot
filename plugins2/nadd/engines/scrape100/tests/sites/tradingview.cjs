'use strict';
// Per-site test for tradingview (TradingView). Run: node tests/sites/tradingview.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('tradingview').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
