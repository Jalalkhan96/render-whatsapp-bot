'use strict';
const { analyzeDestination } = require('./domain-analyzer');
const { detectTracking } = require('./tracking-detector');
const { detectAffiliate } = require('./affiliate/affiliate-detector');
function analyze(urlStr) {
  const dest = analyzeDestination(urlStr);
  const tracking = detectTracking(urlStr);
  const affiliate = detectAffiliate(urlStr);
  return { destination: dest, tracking, affiliate };
}
module.exports = { analyze };
