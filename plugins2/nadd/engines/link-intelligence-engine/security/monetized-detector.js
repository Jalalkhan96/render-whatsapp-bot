'use strict';
// MonetizedShortlinkDetector: recognizes ad/wait/interstitial gates. Never bypasses them.
const MONETIZED_DOMAINS = ['linkvertise.com', 'ouo.io', 'ouo.press', 'shrinkme.io', 'shrtfly.com',
  'shrinkearn.com', 'clk.sh', 'exe.io', 'fc.lc', 'link-center.net', 'za.gl'];
function detect(urlStr, html = '', headers = {}) {
  let host = '';
  try { host = new URL(urlStr).hostname.toLowerCase(); } catch (_) {}
  const known = MONETIZED_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  const h = (html || '').toLowerCase();
  const gateSignals = ['please wait', 'countdown', 'continue', 'verify you are human', 'captcha',
    'i am not a robot', 'click to continue', 'get link'];
  const gate = gateSignals.filter((s) => h.includes(s)).length >= 2;
  if (known || gate) {
    return { type: 'monetized_shortlink', status: 'interaction_required', message: 'Manual interaction required' };
  }
  return { type: 'standard', status: 'ok' };
}
module.exports = { detect, MONETIZED_DOMAINS };
