'use strict';
// SSRF + DNS-rebinding protection. Blocks private/internal targets at every hop.
const dns = require('dns').promises;
const net = require('net');

function ipToInt(ip) {
  const p = ip.split('.').map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function inCidr(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const mask = bits === '0' ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}
const BLOCKED_V4 = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
  '0.0.0.0/8', '169.254.0.0/16', '192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '100.64.0.0/10'];
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);
const CLOUD_METADATA_IPS = new Set(['169.254.169.254', 'fd00:ec2::254']);

function isBlockedIp(ip) {
  if (CLOUD_METADATA_IPS.has(ip)) return true;
  if (net.isIPv4(ip)) return BLOCKED_V4.some((c) => { try { return inCidr(ip, c); } catch (_) { return false; } });
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fe80:') || l.startsWith('fc') || l.startsWith('fd') || l === '::';
  }
  return false;
}
function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  return false;
}
// Resolve hostname -> IPs, reject if ANY resolved IP is blocked (DNS rebinding safe).
async function assertPublicTarget(urlStr) {
  const u = new URL(urlStr);
  const host = u.hostname.toLowerCase();
  if (isBlockedHostname(host)) return { ok: false, reason: 'blocked_hostname', host };
  if (net.isIP(host)) {
    if (isBlockedIp(host)) return { ok: false, reason: 'blocked_ip', host };
    return { ok: true, ips: [host] };
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    return { ok: false, reason: 'dns_failure', host, detail: e.message };
  }
  const ips = addrs.map((a) => a.address);
  const blocked = ips.filter(isBlockedIp);
  if (blocked.length) return { ok: false, reason: 'blocked_ip', host, ips: blocked };
  return { ok: true, ips };
}
module.exports = { assertPublicTarget, isBlockedIp, isBlockedHostname };
