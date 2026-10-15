'use strict';

const os = require('os');
const settings = (() => {
  try { return require('../settings'); } catch { return {}; }
})();

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

function formatUptime(seconds) {
  let s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const out = [];
  if (d) out.push(`${d}d`);
  if (h || d) out.push(`${h}h`);
  if (m || h || d) out.push(`${m}m`);
  out.push(`${s}s`);
  return out.join(' ');
}

function getName(message, context) {
  return context?.senderName || context?.pushName || message?.pushName ||
    message?.key?.participant?.split('@')[0] || message?.key?.remoteJid?.split('@')[0] || 'User';
}

function getBotName() {
  return process.env.BOT_NAME || settings.botName || 'ABIX-AE';
}

function getQuality(latency) {
  if (latency <= 200) return { label: 'FAST', color: '#495057' };
  if (latency <= 500) return { label: 'FAIR', color: '#6c757d' };
  if (latency <= 1000) return { label: 'SLOW', color: '#495057' };
  return { label: 'HIGH LATENCY', color: '#343a40' };
}

function buildPingCardSvg({ latency, message, context = {}, chatId = '' }) {
  const botName = getBotName();
  const userName = getName(message, context);
  const q = getQuality(latency);
  const mem = process.memoryUsage();
  const uptime = formatUptime(process.uptime());
  const maxMs = Math.max(1200, Math.ceil((latency * 1.15) / 100) * 100);
  const marker = Math.min(96, Math.max(2, (latency / maxMs) * 96));
  const host = os.hostname();
  const nodeVersion = process.version;
  const platform = `${process.platform}/${process.arch}`;
  const now = new Date().toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="880" height="1040" viewBox="0 0 880 1040">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8f9fa"/><stop offset="1" stop-color="#e9ecef"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#495057"/><stop offset="1" stop-color="#343a40"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-opacity="0.16"/></filter>
  </defs>

  <rect width="880" height="1040" fill="#dee2e6"/>
  <rect x="42" y="32" width="796" height="976" rx="34" fill="url(#bg)" stroke="#6c757d" stroke-width="3"/>
  <rect x="58" y="48" width="764" height="944" rx="26" fill="none" stroke="#ced4da" stroke-width="1"/>

  <text x="88" y="92" fill="#495057" font-family="Arial,Segoe UI,sans-serif" font-size="25" font-weight="700">—</text>
  <text x="125" y="94" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="23" font-weight="700" letter-spacing="4">${esc(botName.toUpperCase())}</text>
  <text x="778" y="94" fill="#6c757d" font-family="monospace" font-size="17" text-anchor="end" letter-spacing="4">SYSTEM / 01</text>
  <line x1="70" y1="126" x2="810" y2="126" stroke="#adb5bd" stroke-width="1"/>

  <text x="96" y="175" fill="#6c757d" font-family="monospace" font-size="18" letter-spacing="4">CONNECTION REPORT</text>
  <text x="780" y="175" fill="#6c757d" font-family="monospace" font-size="16" text-anchor="end" letter-spacing="3">01 — REPORT</text>

  <text x="96" y="266" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="54">Response</text>
  <text x="428" y="266" fill="url(#accent)" font-family="Georgia,serif" font-size="54" font-style="italic">time.</text>

  <text x="96" y="370" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="112" font-weight="700">${esc(Math.round(latency))}</text>
  <text x="430" y="370" fill="url(#accent)" font-family="Georgia,serif" font-size="50" font-style="italic">ms</text>
  <text x="774" y="365" fill="${q.color}" font-family="monospace" font-size="15" text-anchor="end" letter-spacing="2">${esc(q.label)}</text>

  <text x="96" y="418" fill="#6c757d" font-family="monospace" font-size="18" letter-spacing="3">REACTION SENT</text>

  <line x1="96" y1="472" x2="784" y2="472" stroke="#adb5bd" stroke-width="2"/>
  <g stroke="#adb5bd" stroke-width="2">
    <line x1="96" y1="464" x2="96" y2="480"/><line x1="165" y1="464" x2="165" y2="480"/><line x1="234" y1="464" x2="234" y2="480"/><line x1="303" y1="464" x2="303" y2="480"/>
    <line x1="372" y1="464" x2="372" y2="480"/><line x1="441" y1="464" x2="441" y2="480"/><line x1="510" y1="464" x2="510" y2="480"/><line x1="579" y1="464" x2="579" y2="480"/>
    <line x1="648" y1="464" x2="648" y2="480"/><line x1="717" y1="464" x2="717" y2="480"/><line x1="784" y1="464" x2="784" y2="480"/>
  </g>
  <line x1="96" y1="472" x2="${96 + 688 * marker / 96}" y2="472" stroke="#495057" stroke-width="4" filter="url(#softShadow)"/>
  <circle cx="${96 + 688 * marker / 96}" cy="472" r="6" fill="#212529" filter="url(#softShadow)"/>
  <text x="96" y="515" fill="#6c757d" font-family="monospace" font-size="16">0 MS</text>
  <text x="440" y="515" fill="#6c757d" font-family="monospace" font-size="16" text-anchor="middle">SEND-CALL DURATION</text>
  <text x="784" y="515" fill="#6c757d" font-family="monospace" font-size="16" text-anchor="end">${esc(maxMs)} MS</text>

  <line x1="96" y1="552" x2="784" y2="552" stroke="#adb5bd" stroke-width="1"/>
  <text x="96" y="594" fill="#6c757d" font-family="monospace" font-size="17" letter-spacing="3">HEAP USED</text>
  <text x="470" y="594" fill="#6c757d" font-family="monospace" font-size="17" letter-spacing="3">PROCESS RAM</text>
  <text x="96" y="637" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="28">${esc(formatBytes(mem.heapUsed))}</text>
  <text x="470" y="637" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="28">${esc(formatBytes(mem.rss))}</text>
  <line x1="96" y1="664" x2="784" y2="664" stroke="#adb5bd" stroke-width="1"/>

  <text x="96" y="707" fill="#6c757d" font-family="monospace" font-size="17" letter-spacing="3">NODE.JS PROCESS UPTIME</text>
  <text x="784" y="707" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="24" text-anchor="end">${esc(uptime)}</text>
  <line x1="96" y1="734" x2="784" y2="734" stroke="#adb5bd" stroke-width="1"/>

  <text x="96" y="777" fill="#6c757d" font-family="monospace" font-size="17" letter-spacing="3">REQUESTED BY</text>
  <text x="784" y="777" fill="#212529" font-family="Arial,Segoe UI,sans-serif" font-size="23" text-anchor="end">${esc(userName)}</text>

  <text x="96" y="825" fill="#6c757d" font-family="monospace" font-size="17" letter-spacing="2">NODE ${esc(nodeVersion)}</text>
  <text x="470" y="825" fill="#6c757d" font-family="monospace" font-size="17" letter-spacing="2">${esc(platform)}</text>
  <text x="784" y="825" fill="#6c757d" font-family="monospace" font-size="17" text-anchor="end">${esc(now)}</text>

  <line x1="70" y1="858" x2="810" y2="858" stroke="#adb5bd" stroke-width="1"/>
  <text x="100" y="914" fill="#495057" font-family="Georgia,serif" font-size="25" font-style="italic">Measured on request.</text>
  <text x="780" y="914" fill="#6c757d" font-family="monospace" font-size="16" text-anchor="end" letter-spacing="4">PING / ${esc(botName.toUpperCase())}</text>

  <text x="100" y="956" fill="#6c757d" font-family="monospace" font-size="13" letter-spacing="2">HOST ${esc(host)} · CHAT ${esc(chatId || 'direct')}</text>
</svg>`;
}

module.exports = {
  buildPingCardSvg,
  formatBytes,
  formatUptime,
};
