#!/usr/bin/env node
/*
 * webtoon-tracker.cjs — metadata-only new-episode tracker for webtoons.com
 *
 * Tracks the series YOU follow and tells you when new episodes drop.
 * Reads episode TITLES + DATES ONLY. It never downloads comic images/pages.
 * Reading happens on webtoons.com — this just watches the listings.
 *
 * Zero dependencies. Node 18+.
 *
 *   node webtoon-tracker.cjs add <series-list-url>
 *     e.g. node webtoon-tracker.cjs add "https://www.webtoons.com/en/fantasy/suitor-armor/list?title_no=2159"
 *     (first add baselines to the latest episode — no backlog spam)
 *
 *   node webtoon-tracker.cjs check            # check all series, print new episodes
 *   node webtoon-tracker.cjs check --json     # machine-readable output
 *   node webtoon-tracker.cjs list             # show tracked series
 *   node webtoon-tracker.cjs remove <title|title_no>
 *
 * Tip: run `check` from a cron job / scheduled task every few hours.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const STATE_FILE = path.join(__dirname, 'webtoon-tracker.state.json');
const FETCH_DELAY_MS = 1500;

// ---------- tiny https GET with redirect following ----------
function fetchText(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html' },
      timeout: 25000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetchText(next, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let size = 0;
      const chunks = [];
      res.on('data', (c) => {
        size += c.length;
        if (size > 4 * 1024 * 1024) { req.destroy(); reject(new Error('page too large (>4MB)')); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('request timed out')); });
    req.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripTags = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// ---------- parsing (verified against live webtoons.com HTML, Oct 2026) ----------
function parseSeriesPage(html, url) {
  const titleNo = (url.match(/title_no=(\d+)/) || [])[1];
  if (!titleNo) throw new Error('URL must contain title_no=<id> (use the series /list page URL)');

  const ogTitle = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || `title_no ${titleNo}`;

  const episodes = [];
  const liRe = /<li[^>]*class="[^"]*_episodeItem[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const block = m[1];
    const noM = block.match(/episode_no=(\d+)/) || block.match(/data-episode-no="(\d+)"/);
    const subjM = block.match(/class="subj"><span>([\s\S]*?)<\/span>/);
    const dateM = block.match(/class="date">([^<]*)</);
    const hrefM = block.match(/href="([^"]*viewer\?[^"]*)"/);
    if (!noM) continue;
    episodes.push({
      episode_no: parseInt(noM[1], 10),
      title: subjM ? stripTags(subjM[1]) : `#${noM[1]}`,
      date: dateM ? dateM[1].trim() : '',
      url: hrefM ? hrefM[1].replace(/&amp;/g, '&') : '',
    });
  }
  episodes.sort((a, b) => a.episode_no - b.episode_no);

  // dedupe by episode_no (page can repeat items)
  const seen = new Map();
  for (const e of episodes) if (!seen.has(e.episode_no)) seen.set(e.episode_no, e);
  return { title_no: titleNo, series_title: stripTags(ogTitle), episodes: [...seen.values()] };
}

// ---------- state ----------
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const s = JSON.parse(raw);
    if (!Array.isArray(s.series)) return { series: [] };
    return s;
  } catch { return { series: [] }; }
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ---------- commands ----------
async function cmdAdd(url) {
  if (!url || !/webtoons\.com/.test(url)) {
    console.error('Usage: node webtoon-tracker.cjs add "<webtoons.com series /list URL>"');
    process.exit(2);
  }
  console.log('Fetching series page…');
  const html = await fetchText(url);
  const parsed = parseSeriesPage(html, url);
  if (!parsed.episodes.length) throw new Error('No episodes found — page layout may have changed.');

  const latest = parsed.episodes[parsed.episodes.length - 1].episode_no;
  const state = loadState();
  const existing = state.series.findIndex((s) => s.title_no === parsed.title_no);
  const entry = {
    title_no: parsed.title_no,
    title: parsed.series_title,
    url,
    last_episode_no: latest, // baseline: only FUTURE episodes count as new
    last_check: new Date().toISOString(),
  };
  if (existing >= 0) state.series[existing] = entry; else state.series.push(entry);
  saveState(state);
  console.log(`Tracking "${parsed.series_title}" — baselined at episode #${latest} (${parsed.episodes.length} episodes seen).`);
  console.log('Future `check` runs will report anything above that.');
}

async function cmdCheck(asJson) {
  const state = loadState();
  if (!state.series.length) {
    console.log('No series tracked yet. Add one: node webtoon-tracker.cjs add "<list URL>"');
    return;
  }
  const report = [];
  for (const s of state.series) {
    let parsed;
    try {
      const html = await fetchText(s.url);
      parsed = parseSeriesPage(html, s.url);
    } catch (e) {
      report.push({ title: s.title, title_no: s.title_no, error: e.message, new_episodes: [] });
      await sleep(FETCH_DELAY_MS);
      continue;
    }
    const fresh = parsed.episodes.filter((e) => e.episode_no > s.last_episode_no);
    if (fresh.length) {
      const maxNo = Math.max(...fresh.map((e) => e.episode_no));
      s.last_episode_no = maxNo;
    }
    s.last_check = new Date().toISOString();
    report.push({ title: parsed.series_title, title_no: s.title_no, error: null, new_episodes: fresh });
    await sleep(FETCH_DELAY_MS);
  }
  saveState(state);

  if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }

  let any = false;
  for (const r of report) {
    if (r.error) { console.log(`! ${r.title}: check failed (${r.error})`); continue; }
    if (!r.new_episodes.length) { console.log(`- ${r.title}: no new episodes`); continue; }
    any = true;
    for (const e of r.new_episodes) {
      console.log(`NEW  ${r.title} — #${e.episode_no} "${e.title}"${e.date ? ` (${e.date})` : ''}`);
      if (e.url) console.log(`     ${e.url}`);
    }
  }
  if (!any) console.log('\nAll caught up. Reads happen on webtoons.com — go enjoy them there.');
}

function cmdList() {
  const state = loadState();
  if (!state.series.length) { console.log('No series tracked yet.'); return; }
  for (const s of state.series) {
    console.log(`- ${s.title} (title_no=${s.title_no}) — up to episode #${s.last_episode_no}, last check ${s.last_check}`);
  }
}

function cmdRemove(id) {
  const state = loadState();
  const before = state.series.length;
  state.series = state.series.filter((s) => s.title_no !== id && s.title.toLowerCase() !== String(id).toLowerCase());
  if (state.series.length === before) { console.log('No match found.'); return; }
  saveState(state);
  console.log('Removed.');
}

// ---------- main ----------
(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const asJson = rest.includes('--json');
  try {
    if (cmd === 'add') await cmdAdd(rest[0]);
    else if (cmd === 'check') await cmdCheck(asJson);
    else if (cmd === 'list') cmdList();
    else if (cmd === 'remove') cmdRemove(rest[0]);
    else {
      console.log('webtoon-tracker.cjs — metadata-only new-episode tracker for webtoons.com\n');
      console.log('  add <series-list-url>   track a series (baselines to latest episode)');
      console.log('  check [--json]          check all series for new episodes');
      console.log('  list                    show tracked series');
      console.log('  remove <title|title_no> stop tracking a series');
      process.exit(2);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
