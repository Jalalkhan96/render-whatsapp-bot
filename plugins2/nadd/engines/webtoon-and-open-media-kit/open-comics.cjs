#!/usr/bin/env node
/*
 * open-comics.cjs — bulk comic downloads ONLY from open-license / public-domain sources.
 *
 * Sources (all official, key-free APIs):
 *   1. xkcd — official JSON API (xkcd.com/{n}/info.0.json).
 *      License: CC BY-NC 2.5 — personal/non-commercial use WITH attribution.
 *      An attribution file is written into every output folder automatically.
 *   2. Internet Archive — official advancedsearch + metadata APIs.
 *      Downloads ONLY items whose metadata carries a public-domain or
 *      Creative Commons licenseurl. Unknown license = refused, always.
 *
 * Zero dependencies. Node 18+.
 *
 *   node open-comics.cjs xkcd --from 1 --to 20 --out ./xkcd
 *   node open-comics.cjs xkcd --latest 10 --out ./xkcd
 *   node open-comics.cjs ia-search "thriller comics" --rows 5
 *   node open-comics.cjs ia-download <identifier> --out ./comics [--dry-run]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'open-comics-kit/1.0 (personal archiving tool; contact via github.com/Jalalkhan96)';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } , timeout: 25000 }, (res) => {
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

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest);
        return resolve(downloadFile(new URL(res.headers.location, url).toString(), dest));
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(bytes); });
      res.on('error', (e) => { file.close(); fs.unlinkSync(dest); reject(e); });
    }).on('timeout', function () { this.destroy(); file.close(); try { fs.unlinkSync(dest); } catch {} reject(new Error('timeout: ' + url)); })
      .on('error', (e) => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });
const fmtMB = (b) => (b / 1048576).toFixed(1) + 'MB';

function argVal(args, name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

// positional args with known --flag value pairs removed
function positionals(args, valuedFlags) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (valuedFlags.includes(args[i])) i++; // skip the flag's value too
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

// ---------------- xkcd (official API, CC BY-NC 2.5) ----------------
const XKCD_LICENSE =
`xkcd comics are licensed CC BY-NC 2.5 (https://creativecommons.org/licenses/by-nc/2.5/).
You may use these downloads for PERSONAL, NON-COMMERCIAL purposes with attribution
to xkcd (Randall Munroe). Do not redistribute commercially.`;

async function cmdXkcd(args) {
  const out = argVal(args, '--out', './xkcd');
  mkdirp(out);
  fs.writeFileSync(path.join(out, 'LICENSE-ATTRIBUTION.txt'), XKCD_LICENSE + '\n');

  let nums = [];
  if (args.includes('--latest')) {
    const n = parseInt(argVal(args, '--latest', '5'), 10);
    const latest = await fetchJson('https://xkcd.com/info.0.json');
    for (let i = latest.num; i > latest.num - n && i >= 1; i--) nums.push(i);
  } else {
    const from = parseInt(argVal(args, '--from', '1'), 10);
    const to = parseInt(argVal(args, '--to', '10'), 10);
    for (let i = from; i <= to; i++) nums.push(i);
  }

  let ok = 0, skipped = 0;
  for (const n of nums) {
    let meta;
    try { meta = await fetchJson(`https://xkcd.com/${n}/info.0.json`); }
    catch (e) { console.log(`#${n}: skipped (${e.message})`); skipped++; await sleep(300); continue; }
    const ext = (meta.img.split('.').pop() || 'png').split('?')[0].slice(0, 4);
    const base = `${n}-${meta.safe_title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'untitled'}`;
    const imgPath = path.join(out, `${base}.${ext}`);
    try {
      const bytes = await downloadFile(meta.img, imgPath);
      fs.writeFileSync(path.join(out, `${base}.json`), JSON.stringify({
        num: meta.num, title: meta.title, safe_title: meta.safe_title,
        alt: meta.alt, transcript: meta.transcript, img: meta.img,
        date: `${meta.year}-${meta.month}-${meta.day}`,
        license: 'CC BY-NC 2.5', attribution: 'xkcd by Randall Munroe (xkcd.com)',
      }, null, 2));
      console.log(`#${n} "${meta.title}" — ${fmtMB(bytes)}`);
      ok++;
    } catch (e) { console.log(`#${n}: download failed (${e.message})`); skipped++; }
    await sleep(300); // be polite to the free API
  }
  console.log(`\nDone: ${ok} downloaded, ${skipped} skipped. Attribution: ${path.join(out, 'LICENSE-ATTRIBUTION.txt')}`);
}

// ---------------- Internet Archive (license-checked) ----------------
const LICENSED_RE = /(publicdomain|creativecommons\.org\/(licenses|publicdomain))/i;

async function cmdIaSearch(args) {
  const query = positionals(args, ['--rows']).join(' ') || 'comics';
  const rows = parseInt(argVal(args, '--rows', '10'), 10);
  const q = encodeURIComponent(`mediatype:texts AND (${query})`);
  const url = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=${rows}&output=json`;
  const data = await fetchJson(url);
  const docs = data.response.docs;
  let shown = 0, skipped = 0;
  for (const d of docs) {
    if (d.licenseurl && LICENSED_RE.test(d.licenseurl)) {
      console.log(`\n${d.identifier}\n  title:   ${d.title || '(no title)'}\n  creator: ${d.creator || '?'}\n  license: ${d.licenseurl}`);
      shown++;
    } else skipped++;
  }
  console.log(`\n${shown} openly-licensed results shown, ${skipped} skipped (no verifiable open license).`);
}

async function cmdIaDownload(args) {
  const id = positionals(args, ['--out'])[0];
  if (!id) { console.error('Usage: node open-comics.cjs ia-download <identifier> --out ./comics [--dry-run]'); process.exit(2); }
  const out = argVal(args, '--out', './comics');
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

  const files = (meta.files || []).filter((f) => f.name && !/_(meta|files|reviews)/.test(f.name));
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
  const pick = pdfs.find((f) => /_text\.pdf$/i.test(f.name)) || pdfs.sort((a, b) => a.size - b.size)[0];

  if (dryRun) {
    console.log('\n[dry run] files available:');
    for (const f of files.slice(0, 25)) console.log(`  ${f.name}  ${fmtMB(f.size || 0)}`);
    if (files.length > 25) console.log(`  … +${files.length - 25} more`);
    console.log(`\n[dry run] would download: ${pick ? pick.name : '(no PDF found)'}`);
    return;
  }
  if (!pick) { console.error('No PDF found in this item.'); process.exit(1); }

  mkdirp(out);
  const dest = path.join(out, path.basename(pick.name));
  console.log(`Downloading ${pick.name} (${fmtMB(pick.size || 0)})…`);
  const bytes = await downloadFile(`https://archive.org/download/${id}/${encodeURIComponent(pick.name)}`, dest);
  fs.writeFileSync(path.join(out, `${id}.license.json`), JSON.stringify({
    identifier: id, title: md.title, creator: md.creator,
    licenseurl, source: `https://archive.org/details/${id}`,
    file: pick.name, bytes, downloaded_at: new Date().toISOString(),
  }, null, 2));
  console.log(`Saved ${dest} (${fmtMB(bytes)}). License record: ${id}.license.json`);
}

// ---------------- main ----------------
(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'xkcd') await cmdXkcd(rest);
    else if (cmd === 'ia-search') await cmdIaSearch(rest);
    else if (cmd === 'ia-download') await cmdIaDownload(rest);
    else {
      console.log('open-comics.cjs — bulk comics ONLY from open-license / public-domain sources\n');
      console.log('  xkcd --from 1 --to 20 --out ./xkcd     download xkcd range (official API, CC BY-NC 2.5)');
      console.log('  xkcd --latest 10 --out ./xkcd          download latest N xkcd comics');
      console.log('  ia-search "query" --rows 10            search Internet Archive, open-license items only');
      console.log('  ia-download <identifier> --out ./comics [--dry-run]');
      console.log('                                         download a public-domain/CC comic (PDF)');
      process.exit(2);
    }
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
})();
