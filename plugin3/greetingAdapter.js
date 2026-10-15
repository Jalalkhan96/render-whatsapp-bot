'use strict';

let cached;

function loadGreetingNinja() {
  if (cached !== undefined) return cached;
  try {
    cached = require('greeting-ninja');
  } catch (error) {
    cached = null;
    console.warn('[greeting-ninja] Package is not available yet; using built-in fallback:', error.message);
  }
  return cached;
}

function fallback(name) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: process.env.TIMEZONE || 'Asia/Karachi'
  }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
  return `${greeting}, ${name}! 👋`;
}

function makeGreeting(name) {
  const mod = loadGreetingNinja();
  if (!mod) return fallback(name);

  const candidates = [
    typeof mod === 'function' ? mod : null,
    typeof mod.default === 'function' ? mod.default : null,
    typeof mod.greet === 'function' ? mod.greet : null,
    typeof mod.greeting === 'function' ? mod.greeting : null,
    typeof mod.getGreeting === 'function' ? mod.getGreeting : null,
    typeof mod.createGreeting === 'function' ? mod.createGreeting : null,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      const result = fn(name);
      if (typeof result === 'string' && result.trim()) return result.trim();
      if (result && typeof result.message === 'string' && result.message.trim()) return result.message.trim();
      if (result && typeof result.greeting === 'string' && result.greeting.trim()) return result.greeting.trim();
    } catch (_) {}
  }

  return fallback(name);
}

module.exports = { makeGreeting, loadGreetingNinja };
