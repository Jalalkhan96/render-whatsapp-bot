const DEFAULT_TIMEZONE = process.env.TIMEZONE || 'Asia/Karachi';

const TIMEZONE_ALIASES = Object.freeze({
  // Pakistan
  pakistan: 'Asia/Karachi',
  karachi: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi',
  rawalpindi: 'Asia/Karachi', peshawar: 'Asia/Karachi', quetta: 'Asia/Karachi',
  multan: 'Asia/Karachi', faisalabad: 'Asia/Karachi', swabi: 'Asia/Karachi',
  abbottabad: 'Asia/Karachi', mansehra: 'Asia/Karachi', gujranwala: 'Asia/Karachi',

  // Gulf / Middle East
  dubai: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', sharjah: 'Asia/Dubai', uae: 'Asia/Dubai',
  'united arab emirates': 'Asia/Dubai', riyadh: 'Asia/Riyadh', saudi: 'Asia/Riyadh',
  'saudi arabia': 'Asia/Riyadh', doha: 'Asia/Qatar', qatar: 'Asia/Qatar',
  muscat: 'Asia/Muscat', oman: 'Asia/Muscat', kuwait: 'Asia/Kuwait', bahrain: 'Asia/Bahrain',
  jerusalem: 'Asia/Jerusalem',

  // South / East Asia
  india: 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', kolkata: 'Asia/Kolkata',
  bangladesh: 'Asia/Dhaka', dhaka: 'Asia/Dhaka', nepal: 'Asia/Kathmandu', kathmandu: 'Asia/Kathmandu',
  japan: 'Asia/Tokyo', tokyo: 'Asia/Tokyo', china: 'Asia/Shanghai', beijing: 'Asia/Shanghai',
  singapore: 'Asia/Singapore', malaysia: 'Asia/Kuala_Lumpur', kuala_lumpur: 'Asia/Kuala_Lumpur',
  thailand: 'Asia/Bangkok', bangkok: 'Asia/Bangkok', indonesia: 'Asia/Jakarta', jakarta: 'Asia/Jakarta',
  'south korea': 'Asia/Seoul', korea: 'Asia/Seoul', seoul: 'Asia/Seoul',

  // Europe
  uk: 'Europe/London', 'united kingdom': 'Europe/London', england: 'Europe/London', london: 'Europe/London',
  france: 'Europe/Paris', paris: 'Europe/Paris', germany: 'Europe/Berlin', berlin: 'Europe/Berlin',
  italy: 'Europe/Rome', rome: 'Europe/Rome', spain: 'Europe/Madrid', madrid: 'Europe/Madrid',
  turkey: 'Europe/Istanbul', istanbul: 'Europe/Istanbul', russia: 'Europe/Moscow', moscow: 'Europe/Moscow',
  netherlands: 'Europe/Amsterdam', amsterdam: 'Europe/Amsterdam',

  // Africa
  egypt: 'Africa/Cairo', cairo: 'Africa/Cairo', kenya: 'Africa/Nairobi', nairobi: 'Africa/Nairobi',
  nigeria: 'Africa/Lagos', lagos: 'Africa/Lagos', ghana: 'Africa/Accra', accra: 'Africa/Accra',
  ethiopia: 'Africa/Addis_Ababa', addis_ababa: 'Africa/Addis_Ababa',
  south_africa: 'Africa/Johannesburg', johannesburg: 'Africa/Johannesburg',
  uganda: 'Africa/Kampala', kampala: 'Africa/Kampala', tanzania: 'Africa/Dar_es_Salaam',

  // Americas
  usa: 'America/New_York', 'united states': 'America/New_York', 'new york': 'America/New_York',
  washington: 'America/New_York', miami: 'America/New_York', chicago: 'America/Chicago',
  denver: 'America/Denver', 'los angeles': 'America/Los_Angeles', seattle: 'America/Los_Angeles',
  canada: 'America/Toronto', toronto: 'America/Toronto', vancouver: 'America/Vancouver',
  mexico: 'America/Mexico_City', 'mexico city': 'America/Mexico_City',
  brazil: 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo',

  // Oceania
  australia: 'Australia/Sydney', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne',
  perth: 'Australia/Perth', new_zealand: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland',
  auckland: 'Pacific/Auckland',
});

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/[,_]+/g, ' ').replace(/\s+/g, ' ');
}

function isValidTimezone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function parseFixedOffset(value) {
  const m = String(value || '').trim().match(/^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return null;
  const hours = Number(m[2]);
  const minutes = Number(m[3] || 0);
  if (hours > 14 || minutes > 59) return null;
  const sign = m[1] === '+' ? '+' : '-';
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function offsetLabel(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset'
  }).formatToParts(now);
  const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  return value.replace(/^GMT/, 'UTC');
}

function formatTime(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(now);
}

function resolveKnown(query) {
  const normalized = normalizeQuery(query);
  if (!normalized || ['local', 'here', 'my time', 'my timezone'].includes(normalized)) {
    return { name: 'Pakistan / Bot Local', zone: DEFAULT_TIMEZONE, source: 'default' };
  }

  if (TIMEZONE_ALIASES[normalized]) {
    return { name: query.trim(), zone: TIMEZONE_ALIASES[normalized], source: 'alias' };
  }

  const fixed = parseFixedOffset(query);
  if (fixed) {
    return { name: query.trim().toUpperCase(), zone: fixed, source: 'fixed-offset' };
  }

  if (isValidTimezone(query.trim())) {
    return { name: query.trim(), zone: query.trim(), source: 'iana' };
  }

  return null;
}

async function resolveTimezone(query) {
  const known = resolveKnown(query);
  if (known) return known;

  // Optional network lookup. Uses Node 20's built-in fetch; no axios dependency.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', String(query).trim());
    url.searchParams.set('count', '10');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
    const data = await response.json();
    const item = (data.results || []).find((entry) => entry?.timezone);
    if (!item?.timezone) throw new Error('No timezone in geocoding result');

    return {
      name: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
      zone: item.timezone,
      source: 'geocoding'
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  TIMEZONE_ALIASES,
  normalizeQuery,
  isValidTimezone,
  offsetLabel,
  formatTime,
  resolveKnown,
  resolveTimezone,
};
