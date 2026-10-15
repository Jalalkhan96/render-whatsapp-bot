#!/usr/bin/env node
/*
 * cc-video.cjs — download ONLY Creative Commons / public-domain video.
 *
 * Sources (all official, key-free APIs):
 *   1. Internet Archive — mediatype:movies items whose metadata carries a
 *      public-domain or Creative Commons licenseurl. Unknown license = refused.
 *   2. Wikimedia Commons — every file is freely licensed by site policy;
 *      artist + license are recorded to an attribution file per download.
 *
 * Zero dependencies. Node 18+.
 *
 *   node cc-video.cjs ia-search "prelinger" --rows 5
 *   node cc-video.cjs ia-download <identifier> --out ./videos [--dry-run]
 *   node cc-video.cjs commons-search "waterfall iceland" --rows 5
 *   node cc-video.cjs commons-download "File:Waterfall in Huascarán National Park - Peru.webm" --out ./videos [--dry-run]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'cc-video-kit/1.0 (personal archiving tool; contact via github.com/Jalalkhan96)';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA }, timeout: 25000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchJson(new URL(res.headers.location, url).toString()));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}: ${url}`)); }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad JSON: ' + url)); } });
      res.on('error', reject);
    }).on('timeout', function () { this.destroy(); reject(new Error('timeout: ' + url)); })
      .on('error', reject);
  });
}

function downloadFile(url, dest, attempt = 1) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout: 120000 }, (res) => {
      if (res.statusCode === 429 || res.statusCode === 503) {
        file.close(); try { fs.unlinkSync(dest); } catch {}
        if (attempt < 4) {
          const wait = attempt * 3000;
          console.log(`  (rate-limited, retrying in ${wait / 1000}s… attempt ${attempt + 1}/4)`);
          return void setTimeout(() => resolve(downloadFile(url, dest, attempt + 1)), wait);
        }
        return reject(new Error(`HTTP ${res.statusCode} (rate limited, gave up after 4 attempts): ${url}`));
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest);
        return resolve(downloadFile(new URL(res.headers.location, url).toString(), dest));
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      let bytes = 0, lastLog = 0;
      res.on('data', (c) => {
        bytes += c.length;
        if (bytes - lastLog > 20 * 1048576) { lastLog = bytes; process.stdout.write(`\r  …${(bytes / 1048576).toFixed(0)}MB`); }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); process.stdout.write('\r'); resolve(bytes); });
      res.on('error', (e) => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(e); });
    }).on('timeout', function () { this.destroy(); file.close(); try { fs.unlinkSync(dest); } catch {} reject(new Error('timeout: ' + url)); })
      .on('error', (e) => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });
const fmtMB = (b) => (b / 1048576).toFixed(1) + 'MB';
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function argVal(args, name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
function positionals(args, valuedFlags) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { if (valuedFlags.includes(args[i])) i++; continue; }
    out.push(args[i]);
  }
  return out;
}

const LICENSED_RE = /(publicdomain|creativecommons\.org\/(licenses|publicdomain))/i;
const VIDEO_RE = /\.(mp4|webm|ogv|mov|m4v)$/i;

// ---------------- Internet Archive ----------------
async function cmdIaSearch(args) {
  const query = positionals(args, ['--rows']).join(' ') || 'animation';
  const rows = parseInt(argVal(args, '--rows', '10'), 10);
  const q = encodeURIComponent(`mediatype:movies AND (${query})`);
  const url = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=licenseurl&rows=${rows}&output=json`;
  const data = await fetchJson(url);
  let shown = 0, skipped = 0;
  for (const d of data.response.docs) {
    if (d.licenseurl && LICENSED_RE.test(d.licenseurl)) {
      console.log(`\n${d.identifier}\n  title:   ${d.title || '(no title)'}\n  license: ${d.licenseurl}`);
      shown++;
    } else skipped++;
  }
  console.log(`\n${shown} openly-licensed results shown, ${skipped} skipped (no verifiable open license).`);
}

async function cmdIaDownload(args) {
  const id = positionals(args, ['--out'])[0];
  if (!id) { console.error('Usage: node cc-video.cjs ia-download <identifier> --out ./videos [--dry-run]'); process.exit(2); }
  const out = argVal(args, '--out', './videos');
  const dryRun = args.includes('--dry-run');

  const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  const md = meta.metadata || {};
  const licenseurl = md.licenseurl || '';
  console.log(`Title:   ${md.title || id}\nLicense: ${licenseurl || '(none declared)'}`);
  if (!LICENSED_RE.test(licenseurl)) {
    console.error('\nREFUSED: no public-domain / Creative Commons license on this item.');
    console.error('Unknown license NEVER becomes free — download it manually only if you hold the rights.');
    process.exit(3);
  }

  const vids = (meta.files || []).filter((f) => f.name && VIDEO_RE.test(f.name) && !/_meta\./.test(f.name));
  const pick = vids.find((f) => /_512kb\.mp4$/i.test(f.name))
    || vids.filter((f) => /\.mp4$/i.test(f.name)).sort((a, b) => (a.size || 0) - (b.size || 0))[0]
    || vids.sort((a, b) => (a.size || 0) - (b.size || 0))[0];

  if (dryRun) {
    console.log('\n[dry run] video files:');
    for (const f of vids.slice(0, 15)) console.log(`  ${f.name}  ${fmtMB(f.size || 0)}`);
    console.log(`\n[dry run] would download: ${pick ? `${pick.name} (${fmtMB(pick.size || 0)})` : '(none found)'}`);
    return;
  }
  if (!pick) { console.error('No video file found in this item.'); process.exit(1); }

  mkdirp(out);
  const dest = path.join(out, path.basename(pick.name));
  console.log(`Downloading ${pick.name} (${fmtMB(pick.size || 0)})…`);
  const bytes = await downloadFile(`https://archive.org/download/${id}/${encodeURIComponent(pick.name)}`, dest);
  fs.writeFileSync(path.join(out, `${id}.license.json`), JSON.stringify({
    identifier: id, title: md.title, creator: md.creator,
    licenseurl, source: `https://archive.org/details/${id}`,
    file: pick.name, bytes, downloaded_at: new Date().toISOString(),
  }, null, 2));
  console.log(`\nSaved ${dest} (${fmtMB(bytes)}). License record: ${id}.license.json`);
}

// ---------------- Wikimedia Commons ----------------
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

async function cmdCommonsSearch(args) {
  const query = positionals(args, ['--rows']).join(' ') || 'nature';
  const rows = parseInt(argVal(args, '--rows', '10'), 10);
  const url = `${COMMONS_API}?action=query&format=json&list=search` +
    `&srsearch=${encodeURIComponent('filetype:video ' + query)}&srnamespace=6&srlimit=${rows}`;
  const data = await fetchJson(url);
  for (const r of data.query.search) {
    console.log(`\n${r.title}\n  https://commons.wikimedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`);
  }
  console.log(`\n${data.query.searchinfo.totalhits} total hits. All Commons files are freely licensed (verify per-file license on download).`);
}

async function cmdCommonsDownload(args) {
  let title = positionals(args, ['--out'])[0];
  if (!title) { console.error('Usage: node cc-video.cjs commons-download "File:Name.webm" --out ./videos [--dry-run]'); process.exit(2); }
  const out = argVal(args, '--out', './videos');
  const dryRun = args.includes('--dry-run');
  if (!/^File:/i.test(title)) title = 'File:' + title;

  const url = `${COMMONS_API}?action=query&format=json&prop=imageinfo` +
    `&iiprop=url|size|extmetadata&iiurlwidth=640&titles=${encodeURIComponent(title)}`;
  const data = await fetchJson(url);
  const page = Object.values(data.query.pages)[0];
  if (!page || page.missing) { console.error('File not found on Commons.'); process.exit(1); }
  const ii = (page.imageinfo || [])[0];
  if (!ii) { console.error('No file info returned.'); process.exit(1); }
  const em = ii.extmetadata || {};
  const license = stripHtml(em.LicenseShortName && em.LicenseShortName.value) || 'see UsageTerms';
  const artist = stripHtml(em.Artist && em.Artist.value) || 'unknown';

  console.log(`File:    ${page.title}\nSize:    ${fmtMB(ii.size || 0)}\nLicense: ${license}\nArtist:  ${artist}\nURL:     ${ii.url}`);
  if (dryRun) { console.log('\n[dry run] nothing downloaded.'); return; }

  mkdirp(out);
  // strip Commons' utm tracking params — the canonical file URL needs none of it
  const fileUrl = ii.url.split('?')[0];
  const fname = decodeURIComponent(path.basename(new URL(fileUrl).pathname));
  const dest = path.join(out, fname);
  console.log(`\nDownloading…`);
  const bytes = await downloadFile(fileUrl, dest);
  const base = fname.replace(/\.[a-z0-9]+$/i, '');
  fs.writeFileSync(path.join(out, `${base}.attribution.json`), JSON.stringify({
    title: page.title, artist, license,
    usage_terms: stripHtml(em.UsageTerms && em.UsageTerms.value),
    source_url: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    file_url: fileUrl, bytes, downloaded_at: new Date().toISOString(),
  }, null, 2));
  console.log(`\nSaved ${dest} (${fmtMB(bytes)}). Attribution: ${base}.attribution.json`);
  console.log('Keep the attribution if you reuse this file — the license requires it.');
}

// ---------------- main ----------------
(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'ia-search') await cmdIaSearch(rest);
    else if (cmd === 'ia-download') await cmdIaDownload(rest);
    else if (cmd === 'commons-search') await cmdCommonsSearch(rest);
    else if (cmd === 'commons-download') await cmdCommonsDownload(rest);
    else {
      console.log('cc-video.cjs — downloads ONLY Creative Commons / public-domain video\n');
      console.log('  ia-search "query" --rows 10          search Internet Archive movies (open-license only)');
      console.log('  ia-download <identifier> --out ./videos [--dry-run]');
      console.log('  commons-search "query" --rows 10     search Wikimedia Commons video');
      console.log('  commons-download "File:X.webm" --out ./videos [--dry-run]');
      process.exit(2);
    }
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
})();
