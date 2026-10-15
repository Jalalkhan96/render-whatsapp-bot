'use strict';
/* CLI command layer (MASTER PROMPT §19, §40).
 * Commands (leading dot optional):
 *   .scrape <site> | .scrapeall | .scrapestatus | .scrapefailed
 *   .scrapecategory <cat> | .scrapecountry <cc> | .scrapesearch <site> <query>
 *   .schedule  (start the scheduler)   .health [site]
 */
const { ScraperManager } = require('./lib/manager.cjs');
const { printSummary, writeReport } = require('./lib/report.cjs');
const db = require('./lib/db.cjs');
const health = require('./lib/health.cjs');
const log = require('./lib/logger.cjs');

function stripDot(s) { return s.startsWith('.') ? s.slice(1) : s; }

async function main() {
  const raw = process.argv.slice(2);
  if (!raw.length) return usage();
  const cmd = stripDot(raw[0]).toLowerCase();
  const args = raw.slice(1);
  const manager = new ScraperManager();

  switch (cmd) {
    case 'scrape': {
      const site = args[0];
      if (!site) return console.log('usage: .scrape <site>');
      const r = await manager.runSite(site, { limit: parseInt(process.env.LIMIT, 10) || undefined });
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case 'scrapeall': {
      const summary = await manager.runAll({ since: process.env.SINCE || undefined });
      printSummary(summary);
      writeReport(summary);
      break;
    }
    case 'scrapestatus': {
      const rows = db.query(`SELECT run_id, site, status, records_found, records_saved, duration_ms, finished_at
        FROM scrape_site_runs ORDER BY finished_at DESC LIMIT 100`);
      if (!rows.length) return console.log('no runs recorded yet');
      for (const r of rows) console.log(`${r.finished_at} [${r.site}] ${r.status} found=${r.records_found} saved=${r.records_saved} ${r.duration_ms}ms`);
      break;
    }
    case 'scrapefailed': {
      const rows = db.query(`SELECT site, status, reason, finished_at FROM scrape_site_runs
        WHERE status='failed' AND finished_at = (SELECT MAX(finished_at) FROM scrape_site_runs s2 WHERE s2.site = scrape_site_runs.site)
        ORDER BY site`);
      if (!rows.length) return console.log('no failed sites in latest runs');
      for (const r of rows) console.log(`${r.site}: ${r.reason}`);
      break;
    }
    case 'scrapecategory': {
      const cat = args[0];
      if (!cat) return console.log('usage: .scrapecategory <category>');
      const results = await manager.runCategory(cat, {});
      printMini(results);
      break;
    }
    case 'scrapecountry': {
      const cc = (args[0] || '').toUpperCase();
      if (!cc) return console.log('usage: .scrapecountry <PK|INT>');
      const results = await manager.runCountry(cc, {});
      printMini(results);
      break;
    }
    case 'scrapesearch': {
      const [site, ...q] = args;
      if (!site || !q.length) return console.log('usage: .scrapesearch <site> <query>');
      const out = await manager.searchSite(site, q.join(' '), {});
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case 'health': {
      if (args[0]) console.log(JSON.stringify(health.getHealth(args[0]), null, 2));
      else for (const h of health.allHealth()) console.log(`${h.id.padEnd(16)} ${h.health} fails=${h.failure_count} records=${h.record_count}`);
      break;
    }
    case 'schedule': {
      const { startScheduler } = require('./lib/scheduler.cjs');
      console.log('scheduler started (Ctrl+C to stop)');
      startScheduler({});
      break;
    }
    default:
      console.log(`unknown command: ${cmd}`);
      usage();
  }
  db.close();
}

function printMini(results) {
  for (const r of results) console.log(`${r.site}: ${r.status} saved=${r.recordsSaved} ${r.reason || ''}`);
}

function usage() {
  console.log(`scrape100 commands:
  .scrape <site>              scrape one site
  .scrapeall                  sequential run of all enabled sites
  .scrapestatus               recent per-site run statuses
  .scrapefailed                failed sites from latest runs
  .scrapecategory <category>  run all sites in a category
  .scrapecountry <PK|INT>     run all sites in a country group
  .scrapesearch <site> <q>    search within a site
  .health [site]              source health states
  .schedule                   start the built-in scheduler
env: SINCE=today|last_1_hour|last_6_hours|last_12_hours|last_24_hours|last_3_days|all  LIMIT=n`);
}

main().catch(err => { log.error('cli.fatal', { err: err.message }); console.error(err.message); process.exit(1); });
