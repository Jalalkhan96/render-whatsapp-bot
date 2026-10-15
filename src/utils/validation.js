import { config } from '../config.js';

export function isValidText(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

export function isWithinLength(text) {
  return typeof text === 'string' && text.length <= config.limits.maxMessageLength;
}

export function sanitizeForLog(text, maxLen = 200) {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen)}…` : flat;
}

export function extractJidNumber(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0];
}
