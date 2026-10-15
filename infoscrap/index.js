const axios = require('axios');
const cheerio = require('cheerio');
const { googleNews } = require('../lib/newsrss');

const UA = { 'User-Agent': 'ABIX-AE InfoScrap/1.0', Accept: 'text/html,application/xhtml+xml' };
const SOURCES = {
  gold: 'https://gold.pk/',
  silver: 'https://gold.pk/',
  petrol: 'https://www.pakistantoday.com.pk/petrol-prices/',
  diesel: 'https://www.pakistantoday.com.pk/petrol-prices/'
};
const ALERT_QUERIES = {
  rain: 'Pakistan rain alert',
  flood: 'Pakistan flood alert',
  heatwave: 'Pakistan heatwave alert',
  fog: 'Pakistan fog alert',
  weather: 'Pakistan weather alert',
  earthquake: 'Pakistan earthquake'
};

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function exchangeRates() {
  const { data } = await axios.get('https://open.er-api.com/v6/latest/PKR', { timeout: 15000 });
  if (data.result !== 'success' || !data.rates) throw new Error('Exchange rate source unavailable');
  return {
    USD: 1 / data.rates.USD,
    GBP: 1 / data.rates.GBP,
    EUR: 1 / data.rates.EUR,
    SAR: 1 / data.rates.SAR,
    AED: 1 / data.rates.AED,
    fetchedAt: new Date().toISOString()
  };
}

function extractPrice(text, terms) {
  const normalized = clean(text);
  for (const term of terms) {
    const match = normalized.match(new RegExp(`${term}[\\s\\S]{0,100}?(?:Rs\\.?|PKR)\\s*([\\d,]+(?:\\.\\d+)?)`, 'i'));
    if (match) return match[1];
  }
  return null;
}

async function marketPrices() {
  const results = {};
  for (const [key, url] of Object.entries(SOURCES)) {
    try {
      const { data: html } = await axios.get(url, { timeout: 20000, headers: UA, maxContentLength: 6 * 1024 * 1024 });
      const text = cheerio.load(html)('body').text();
      results[key] = {
        price: extractPrice(text, key === 'gold' ? ['gold', '24k'] : key === 'silver' ? ['silver'] : [key]),
        source: url
      };
    } catch (error) {
      results[key] = { error: error.message, source: url };
    }
  }
  return results;
}

async function weather(city, days = 1) {
  const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
    timeout: 20000,
    headers: UA
  });
  return {
    city,
    current: data.current_condition?.[0],
    forecast: (data.weather || []).slice(0, days)
  };
}

async function news(kind = 'pakistan', city = '') {
  const queries = {
    pakistan: 'Pakistan latest news',
    breaking: 'Pakistan breaking news',
    province: `${city || 'Punjab Sindh Khyber Pakhtunkhwa Balochistan'} news`,
    district: `${city || 'Pakistan district'} news`,
    weather: 'Pakistan weather rain flood alert',
    flood: 'Pakistan flood rain alert',
    earthquake: 'Pakistan earthquake alert'
  };
  const items = await googleNews(queries[kind] || queries.pakistan, 'PK', 8);
  return { label: `🇵🇰 ${kind} news`, items };
}

async function alerts(type = 'weather', city = '') {
  if (type === 'earthquake') {
    const { data } = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { timeout: 20000 });
    return data.features.filter(item => /pakistan|india|afghanistan|iran/i.test(item.properties.place || '')).slice(0, 8)
      .map(item => ({ title: item.properties.title, url: item.properties.url, time: new Date(item.properties.time).toISOString() }));
  }
  return (await news(type, city)).items;
}

module.exports = { SOURCES, exchangeRates, marketPrices, weather, news, alerts, extractPrice };
