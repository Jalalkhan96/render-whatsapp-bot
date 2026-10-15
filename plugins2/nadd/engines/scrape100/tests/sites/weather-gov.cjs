'use strict';
// Per-site test for weather-gov (Pakistan Meteorological Dept). Run: node tests/sites/weather-gov.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('weather-gov').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
