'use strict';
// Per-site test for booking (Booking.com). Run: node tests/sites/booking.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('booking').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
