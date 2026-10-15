'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function maskedConfigured(value) {
  return Boolean(String(value || '').trim());
}

function envConfigured(name) {
  return maskedConfigured(process.env[name]);
}

function configuredApifyTokens() {
  return Object.keys(process.env)
    .filter((key) => /^APIFY_TOKEN_\d+$/.test(key) && maskedConfigured(process.env[key]))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function classifyApi(name, details) {
  return { name, ...details };
}

function getConfiguredApiInventory() {
  return [
    classifyApi('Apify social/search', {
      provider: 'Apify',
      configured: configuredApifyTokens().length > 0,
      auth: configuredApifyTokens().length > 0 ? 'token-pool' : 'missing',
    }),
    classifyApi('Apify gateway', {
      provider: 'Google Apps Script / gateway',
      configured: envConfigured('APIFY_GATEWAY_URL') && envConfigured('APIFY_GATEWAY_SECRET'),
      auth: 'secret',
    }),
    classifyApi('Gemini', {
      provider: 'Google Gemini / configured Web2API',
      configured: envConfigured('GEMINI_API_KEY') || envConfigured('GEMINI_HOST'),
      auth: envConfigured('GEMINI_API_KEY') ? 'api-key' : 'local-web2api',
    }),
    classifyApi('Groq', {
      provider: 'Groq',
      configured: envConfigured('GROQ_API_KEY'),
      auth: 'api-key',
    }),
    classifyApi('Telegram', {
      provider: 'Telegram Bot API',
      configured: envConfigured('TELEGRAM_BOT_TOKEN'),
      auth: 'bot-token',
    }),
  ];
}

async function httpProbe(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return { ok: response.ok, status: response.status, contentType: response.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

async function probeApifyActor(actorId) {
  const tokens = configuredApifyTokens();
  if (!tokens.length) return { status: 'CONFIGURATION REQUIRED', reason: 'No APIFY_TOKEN_n configured.' };
  const encoded = encodeURIComponent(actorId).replace('%2F', '~');
  const failures = [];
  for (const key of tokens.slice(0, 3)) {
    const token = process.env[key];
    try {
      const result = await httpProbe(`https://api.apify.com/v2/acts/${encoded}?token=${encodeURIComponent(token)}`, {}, 12000);
      if (result.status === 200) return { status: 'PASS', keyId: key, actor: actorId };
      if (result.status === 401 || result.status === 403) failures.push(`${key}: auth ${result.status}`);
      else if (result.status === 404) return { status: 'FAIL', keyId: key, actor: actorId, reason: 'Actor not found or unavailable.' };
      else failures.push(`${key}: HTTP ${result.status}`);
    } catch (error) {
      failures.push(`${key}: ${error.name || 'Error'} ${error.message}`);
    }
  }
  return { status: 'FAIL', actor: actorId, reason: failures.join('; ') };
}

async function probeActorSet(actorMap) {
  const out = [];
  for (const [platform, actorId] of Object.entries(actorMap)) {
    out.push({ platform, actorId, ...(await probeApifyActor(actorId)) });
  }
  return out;
}

function localHealth() {
  const requiredFiles = [
    path.join(__dirname, 'owner.js'),
    path.join(__dirname, 'permissions.js'),
    path.join(__dirname, 'commandHandler.js'),
    path.join(__dirname, 'interactiveMenu.js'),
    path.join(__dirname, 'menuCarousel.js'),
  ];
  return requiredFiles.every(fs.existsSync);
}

module.exports = {
  envConfigured,
  configuredApifyTokens,
  getConfiguredApiInventory,
  httpProbe,
  probeApifyActor,
  probeActorSet,
  localHealth,
};
