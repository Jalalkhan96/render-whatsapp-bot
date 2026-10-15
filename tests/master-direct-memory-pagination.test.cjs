'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

let carouselPayload = null;
const interactiveMock = {
  sendInteractiveCarousel: async (_sock, _chatId, payload) => { carouselPayload = payload; return payload; },
  sendInteractiveMessage: async (_sock, _chatId, payload) => { carouselPayload = { cards: [payload] }; return payload; },
};

function parseAttrs(tag) {
  const out = {};
  for (const match of String(tag).matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/gs)) out[match[1].toLowerCase()] = match[3];
  return out;
}
function fakeCheerioLoad(html) {
  const source = String(html || '');
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => ({ kind: 'script', attrs: parseAttrs(`<script ${match[1]}>`), text: match[2] }));
  const anchors = [...source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(match => ({ kind: 'anchor', attrs: parseAttrs(`<a ${match[1]}>`), inner: match[2] }));
  const imgs = [...source.matchAll(/<img\b([^>]*)>/gi)].map(match => ({ kind: 'img', attrs: parseAttrs(`<img ${match[1]}>`) }));
  const tags = (tagName) => [...source.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, 'gi'))].map(match => ({ kind: tagName, attrs: parseAttrs(`<${tagName} ${match[1]}>`) }));
  const metas = tags('meta');
  const links = tags('link');
  const videos = tags('video');
  const sources = tags('source');
  function wrapAttr(el) {
    return {
      attr(name) { return el?.attrs?.[String(name).toLowerCase()]; },
      text() { return el?.inner ? el.inner.replace(/<[^>]*>/g, ' ') : (el?.text || ''); },
      contents() { return { text: () => el?.text || '' }; },
      find(selector) {
        if (selector === 'img') {
          const innerImgs = [...String(el?.inner || '').matchAll(/<img\b([^>]*)>/gi)].map(m => ({ kind: 'img', attrs: parseAttrs(`<img ${m[1]}>`) }));
          return collection(innerImgs);
        }
        return collection([]);
      },
    };
  }
  function collection(items) {
    return {
      each(callback) { items.forEach((item, index) => callback(index, item)); return this; },
      first() { return wrapAttr(items[0]); },
      attr(name) { return items[0]?.attrs?.[String(name).toLowerCase()]; },
      text() { return items.map(item => item.inner || item.text || '').join(''); },
      contents() { return { text: () => items[0]?.text || '' }; },
    };
  }
  return function $(selector) {
    if (selector && typeof selector === 'object' && selector.kind) return wrapAttr(selector);
    if (selector === 'a') return collection(anchors);
    if (selector === 'img') return collection(imgs);
    if (selector === 'script') return collection(scripts);
    if (selector === 'script[type="application/ld+json"]') return collection(scripts.filter(s => (s.attrs.type || '').toLowerCase() === 'application/ld+json'));
    if (selector === 'video') return collection(videos);
    if (selector === 'video source') return collection(sources);
    if (selector === 'source[type^="video/"]') return collection(sources.filter(s => String(s.attrs.type || '').startsWith('video/')));
    if (selector === 'link[rel="image_src"]') return collection(links.filter(l => l.attrs.rel === 'image_src'));
    if (String(selector).startsWith('meta[')) {
      const prop = String(selector).match(/property="([^"]+)"/)?.[1];
      const name = String(selector).match(/name="([^"]+)"/)?.[1];
      const itemprop = String(selector).match(/itemprop="([^"]+)"/)?.[1];
      return collection(metas.filter(m => (prop && m.attrs.property === prop) || (name && m.attrs.name === name) || (itemprop && m.attrs.itemprop === itemprop)));
    }
    return collection([]);
  };
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'cheerio') return { load: fakeCheerioLoad };
  if (String(request).includes('interactiveMenu')) return interactiveMock;
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  const utils = require('../plugins2/direct-scrapers/command-utils.cjs');
  const parsed = utils.parseOptions(['anime', '--site=zerochan'], 4);
  assert.equal(parsed.query, 'anime');
  assert.equal(parsed.site, 'zerochan');
  assert.throws(() => utils.parseOptions(['anime', '--site=xvideo'], 4), /Adult-content sources are disabled/i);
  assert.equal(parsed.perSiteLimit, 30, 'default result pool should support MORE VIDEO pagination');
  assert.equal(utils.parseOptions(['--list-sites'], 74).listSites, true, 'site-list flag should be recognized');

  const playerHtml = String.raw`<meta property="og:image" content="https://cdn.example/thumb.jpg"><script>html5player.setVideoUrl240('https:\/\/cdn.example/clip_240p.mp4'); html5player.setVideoUrlLow('https:\/\/cdn.example/clip_480p.mp4'); html5player.setVideoUrlHigh('https:\/\/cdn.example/clip_1080p.mp4'); html5player.setVideoUrlHigh('https:\/\/cdn.example/hidden_high_480p.mp4');</script>`;
  const media = utils.extractMediaFromHtml(playerHtml, 'https://www.zerochan.net/12345');
  assert.equal(media.mediaType, 'video');
  assert.equal(media.mediaUrl, 'https://cdn.example/clip_240p.mp4');
  assert.equal(media.thumbnailUrl, 'https://cdn.example/thumb.jpg');
  assert.deepEqual(media.mediaOptions.map(option => option.quality), ['240p', '480p'], 'only 240p/480p variants should be exposed; 1080p must be ignored');

  const oldFetch = global.fetch;
  global.fetch = async (rawUrl) => {
    const url = String(rawUrl);
    if (url.includes('cdn.example/thumb')) {
      const body = Buffer.from('small-test-image');
      return new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) } });
    }
    throw new Error(`Unexpected test fetch: ${url}`);
  };
  const results = Array.from({ length: 3 }, (_, index) => ({
    title: `Video ${index + 1}`,
    platform: 'zerochan',
    url: `https://www.zerochan.net/${index + 1}`,
    mediaUrl: `https://cdn.example/video${index + 1}_240p.mp4`,
    mediaType: 'video',
    mediaOptions: [
      { quality: '240p', label: '240P', url: `https://cdn.example/video${index + 1}_240p.mp4` },
      { quality: '480p', label: '480P', url: `https://cdn.example/video${index + 1}_480p.mp4` },
    ],
    thumbnailUrl: `https://cdn.example/thumb${index + 1}.jpg`,
    _mediaResolved: true,
  }));
  const session = { command: 'masterdirect', query: 'anime', results };
  const sock = { sendMessage: async () => ({}) };
  await utils.renderMediaPage(sock, 'chat:test', session, 'tok', 0, '-', 'mdscrape');
  assert.equal(carouselPayload.cards.length, 1, 'slider should show only one video per message');
  const firstButtons = carouselPayload.cards[0].buttons.map(button => JSON.parse(button.buttonParamsJson));
  assert.ok(firstButtons.some(button => button.display_text === '⬇️ DOWNLOAD 240P'), '240p download button should appear');
  assert.ok(firstButtons.some(button => button.display_text === '⬇️ DOWNLOAD 480P'), '480p download button should appear');
  assert.ok(firstButtons.some(button => button.display_text === '➡️ MORE VIDEO'), 'MORE VIDEO should advance to the next result');
  assert.ok(!firstButtons.some(button => /720|1080|high/i.test(button.display_text)), 'no high-quality button may appear');
  await utils.renderMediaPage(sock, 'chat:test', session, 'tok', 1, '-', 'mdscrape');
  assert.equal(carouselPayload.cards.length, 1, 'next page should show exactly one next video');
  assert.ok(carouselPayload.cards[0].footer.includes('zerochan') || carouselPayload.cards[0].body.includes('Video 2'), 'next page should select the next video');
  await utils.renderMediaPage(sock, 'chat:test', session, 'tok', 2, '-', 'mdscrape');
  assert.equal(carouselPayload.cards.length, 1, 'final page should still show one video');
  const finalButtons = carouselPayload.cards[0].buttons.map(button => JSON.parse(button.buttonParamsJson));
  assert.ok(!finalButtons.some(button => button.display_text === '➡️ MORE VIDEO'), 'final result should not show MORE VIDEO');

  const { MasterDirectScraper } = require('../plugins2/direct-scrapers/master-direct-one.cjs');
  const anchors = Array.from({ length: 25 }, (_, index) => `<a href="/video.test${index}/anime-item-${index}.html" title="Anime item ${index}">Anime item ${index}</a>`).join('');
  global.fetch = async () => new Response(`<html><body>${anchors}</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
  const outputDir = path.join('/tmp', `mdscrape-memory-test-${process.pid}`);
  const scraper = new MasterDirectScraper(outputDir);
  const scraped = await scraper.runPipeline('anime', { targetId: 'zerochan', perSiteLimit: 30, delayMs: 400 });
  assert.equal(scraped.length, 25, 'scraper 1 should retain up to 30 candidates');
  assert.equal(fs.existsSync(outputDir), false, 'scraper 1 must not create output directory or persist JSON');

  const { MasterDirectScraper: MasterDirectScraper2 } = require('../plugins2/direct-scrapers/master-direct-two.cjs');
  const outputDir2 = path.join('/tmp', `mdscrape-memory-test-two-${process.pid}`);
  const scraper2 = new MasterDirectScraper2(outputDir2);
  const scraped2 = await scraper2.runPipeline('anime', { targetId: 'zerochan', perSiteLimit: 30, delayMs: 400 });
  assert.equal(scraped2.length, 25, 'scraper 2 should retain up to 30 candidates');
  assert.equal(fs.existsSync(outputDir2), false, 'scraper 2 must not create output directory or persist JSON');

  global.fetch = oldFetch;
  Module._load = originalLoad;
  process.stdout.write('PASS: site alias/list-sites, explicit 240p/480p extraction, high-quality exclusion, one-video pagination, low-quality buttons, and memory-only results.\n');
}

main().catch(error => {
  global.fetch = global.fetch;
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
