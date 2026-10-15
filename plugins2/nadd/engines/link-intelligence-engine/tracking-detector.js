'use strict';
// Detects + classifies query parameters: functional / tracking / affiliate / unknown.
const TRACKING = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
  'gclid','gbraid','wbraid','fbclid','msclkid','ttclid','dclid','yclid','igshid',
  'mc_cid','mc_eid','vero_conv','vero_id','_ga','_gl','pk_campaign','pk_kwd','piwik_campaign',
  'matomo_campaign','sc_campaign','sc_channel','srsltid','gad_source','ref_src','ref_url']);
const AFFILIATE = new Set(['tag','ref','refid','affiliate','aff','affid','aff_id','partner','campaign',
  'clickid','click_id','subid','sub_id','subid1','tracking_id','associate','ascsubtag']);
const FUNCTIONAL = new Set(['id','q','query','search','page','p','lang','locale','v','t','sort','filter',
  'category','product','sku','pid','sid','sessionid','next','redirect','url','u','target']);
const SENSITIVE = new Set(['token','token_id','access_token','auth','session','sessionid','code','secret',
  'key','password','passwd','reset_token','unsubscribe_token','api_key','apikey','private_key']);

function classifyParam(name) {
  const n = name.toLowerCase();
  if (SENSITIVE.has(n)) return 'sensitive';
  if (AFFILIATE.has(n)) return 'affiliate';
  if (TRACKING.has(n)) return 'tracking';
  if (FUNCTIONAL.has(n)) return 'functional';
  if (/^(utm_|pk_|piwik_|matomo_)/.test(n)) return 'tracking';
  if (/(track|affil|campaign|click|referr)/.test(n)) return 'tracking';
  return 'unknown';
}
function detectTracking(urlStr) {
  const u = new URL(urlStr);
  const parameters = [];
  for (const [name] of u.searchParams.entries()) {
    const type = classifyParam(name);
    parameters.push({ name, type });
  }
  const trackingParams = parameters.filter((p) => p.type === 'tracking' || p.type === 'affiliate').map((p) => p.name);
  return { detected: trackingParams.length > 0, parameters: trackingParams, all: parameters };
}
// cleanUrl: removes tracking/affiliate params, keeps functional. Redacts sensitive.
function cleanUrl(urlStr, { redactSensitive = true } = {}) {
  const u = new URL(urlStr);
  const removed = [];
  for (const [name] of Array.from(u.searchParams.entries())) {
    const t = classifyParam(name);
    if (t === 'tracking' || t === 'affiliate') { removed.push(name); u.searchParams.delete(name); }
    else if (t === 'sensitive' && redactSensitive) { u.searchParams.set(name, '[REDACTED]'); removed.push(name + '=[REDACTED]'); }
  }
  return { clean: u.toString(), removed };
}
module.exports = { detectTracking, cleanUrl, classifyParam, TRACKING, AFFILIATE, FUNCTIONAL, SENSITIVE };
