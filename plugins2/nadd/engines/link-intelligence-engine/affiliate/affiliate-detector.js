'use strict';
const { detectTracking } = require('../tracking-detector');
const WRAPPER_DOMAINS = ['amazon.', 'amzn.to', 'clickbank.net', 'jvzoo.com', 'shareasale.com',
  'impact.com', 'partnerize.com', 'awin1.com', 'go.skimresources.com', 's.click.aliexpress.com'];
function detectAffiliate(urlStr) {
  const t = detectTracking(urlStr);
  const affParams = t.all.filter((p) => p.type === 'affiliate').map((p) => p.name);
  const host = new URL(urlStr).hostname.toLowerCase();
  const wrapper = WRAPPER_DOMAINS.some((d) => host.includes(d));
  return { detected: affParams.length > 0 || wrapper, parameters: affParams, wrapper };
}
module.exports = { detectAffiliate, WRAPPER_DOMAINS };
