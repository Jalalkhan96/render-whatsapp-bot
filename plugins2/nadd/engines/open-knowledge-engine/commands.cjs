/*
 * commands.cjs — WhatsApp bot plugin: open-knowledge engine (§55).
 *
 * Exports: { name, prefix, handle(cmd, args, ctx) }
 *
 * Commands (prefix `-`, never `$`):
 *   -wiki -wikidata -archive -archiveall -book -author -document -history
 *   -newspaper -paper -research -dataset -govdata -science -place -mapinfo
 *   -oldphoto -museum -art -publicdomain -webarchive -ai -knowledge
 *   -searchtext -booksearch
 *   -next / -prev  (session pagination, §58)
 *   -sourcehealth  (§83)
 *   -testsource <id> / -testall  (§99)
 *   Admin only: -ingest <source> | -ingeststatus | -ingestpause |
 *     -ingestresume | -ingeststop (§97),
 *     -source enable|disable|test|info <source> (§98)
 *
 * Result cards follow §59-67 (plain text). Every card ends with a source
 * citation (§54: source name, URL, retrieval timestamp, source identifier).
 * §75: fields that are missing render as "unknown" — never invented.
 */
'use strict';

const path = require('path');
const { makeRegistry } = require('./core/registry.cjs');
const { KnowledgeRouter } = require('./core/query-router.cjs');
const { SearchEngine } = require('./core/search-engine.cjs');
const { Cache } = require('./core/cache.cjs');
const { HealthManager } = require('./core/health-manager.cjs');
const { Store } = require('./core/store.cjs');
const { EntityGraph } = require('./core/entity-graph.cjs');
const { Scheduler } = require('./core/scheduler.cjs');

const ENGINE_ROOT = __dirname;
const SESSIONS = new Map(); // sessionId -> { query, command, results, cursor, pageSize, expiresAt }
const INGEST_JOBS = new Map(); // sourceId -> { status, startedAt, detail }

const PAGE_SIZE = 5;
const SESSION_TTL_MS = 15 * 60 * 1000;

function uv(v) { return v === null || v === undefined || v === '' ? 'unknown' : v; }

function citation(r) {
  // §54 citation block: source name, URL, retrieval timestamp, identifier.
  const lines = [
    '—',
    `Source: ${uv(r.source)}`,
    r.sourceUrl ? `URL: ${r.sourceUrl}` : null,
    r.sourceId ? `ID: ${r.sourceId}` : null,
    `Retrieved: ${uv(r.retrievedAt)}`,
    r.rights && r.rights !== 'unknown' ? `Rights: ${r.rights}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function cardBook(r) {
  const b = (r.metadata && r.metadata.book) || {};
  return [
    '📚 KNOWLEDGE RESULT — BOOK',
    '', `Title: ${uv(r.title)}`,
    `Author: ${(b.author || []).join(', ') || 'unknown'}`,
    `Publisher: ${uv(b.publisher)}`,
    `Published: ${uv(b.publicationDate)}`,
    `ISBN: ${(b.isbn || []).join(', ') || 'unknown'}`,
    `Language: ${uv(r.language)}`,
    `License: ${uv(r.license)}`,
    b.downloadAvailable ? '📥 Download: available (see source page)' : null,
    '', citation(r),
  ].filter((l) => l !== null).join('\n');
}

function cardResearch(r) {
  const m = (r.metadata && r.metadata.research) || {};
  return [
    '🔬 RESEARCH',
    '', `Title: ${uv(r.title)}`,
    `Authors: ${(m.authors || []).join(', ') || 'unknown'}`,
    `Journal: ${uv(m.journal)}`,
    `DOI: ${uv(m.doi)}`,
    `Published: ${uv(m.publicationDate)}`,
    `Citations: ${m.citations != null ? m.citations : 'unknown'}`,
    `Open Access: ${m.openAccess ? '✅' : 'unknown'}`,
    '', citation(r),
  ].join('\n');
}

function cardArchive(r) {
  const a = (r.metadata && r.metadata.archive) || {};
  return [
    '📚 INTERNET ARCHIVE',
    '', `Title: ${uv(r.title)}`,
    `Identifier: ${uv(a.identifier)}`,
    `Creator: ${uv(r.creator)}`,
    `Date: ${uv(r.date)}`,
    `Collection: ${uv(a.collection)}`,
    `Media: ${(a.mediaType || []).join(', ') || 'unknown'}`,
    `Rights: ${uv(r.rights)}`,
    `🔗 Open: ${uv(r.sourceUrl)}`,
    '', citation(r),
  ].join('\n');
}

function cardWiki(r) {
  return [
    '📚 WIKIPEDIA',
    '', `Title: ${uv(r.title)}`,
    `Summary: ${r.description ? r.description.slice(0, 500) : 'unknown'}`,
    '', `🌐 Language: ${uv(r.language)}`,
    '', citation(r),
  ].join('\n');
}

function cardWikidata(r) {
  const p = (r.metadata && r.metadata.person) || (r.metadata && r.metadata.place) || {};
  const ids = r.identifiers || {};
  return [
    '🧬 WIKIDATA',
    '', `Entity: ${uv(r.title)}`,
    ids.wikidata ? `QID: ${ids.wikidata}` : null,
    p.name ? `Name: ${p.name}` : null,
    r.description ? `Description: ${r.description.slice(0, 300)}` : null,
    r.coordinates && r.coordinates.lat != null ? `Coordinates: ${r.coordinates.lat}, ${r.coordinates.lon}` : null,
    '', citation(r),
  ].filter((l) => l !== null).join('\n');
}

function cardDataset(r) {
  const d = (r.metadata && r.metadata.dataset) || {};
  return [
    '📊 DATASET',
    '', `Name: ${uv(r.title)}`,
    `Publisher: ${uv(d.publisher || d.organization)}`,
    `Updated: ${uv(d.updatedAt)}`,
    `Format: ${(d.format || []).join(', ') || 'unknown'}`,
    `License: ${uv(r.license)}`,
    d.downloadUrl ? `📥 Download: ${d.downloadUrl}` : null,
    '', citation(r),
  ].filter((l) => l !== null).join('\n');
}

function cardImage(r) {
  return [
    '🖼️ IMAGE',
    '', `Title: ${uv(r.title)}`,
    `Creator: ${uv(r.creator)}`,
    `Date: ${uv(r.date)}`,
    `Source: ${uv(r.source)}`,
    r.thumbnailUrl ? `Thumbnail: ${r.thumbnailUrl}` : null,
    `Rights: ${uv(r.rights)} (license: ${uv(r.license)})`,
    '', citation(r),
  ].filter((l) => l !== null).join('\n');
}

function cardPlace(r) {
  const p = (r.metadata && r.metadata.place) || {};
  return [
    '📍 PLACE',
    '', `Name: ${uv(p.name)}`,
    `Country: ${uv(p.country)}`,
    `Region: ${uv(p.region)}`,
    r.coordinates && r.coordinates.lat != null ? `Coordinates: ${r.coordinates.lat}, ${r.coordinates.lon}` : null,
    p.population != null ? `Population: ${p.population}` : null,
    p.timezone ? `Timezone: ${p.timezone}` : null,
    '', citation(r),
  ].filter((l) => l !== null).join('\n');
}

function cardDefault(r) {
  const heads = { wikipedia: '📚 WIKIPEDIA', internet_archive: '📚 INTERNET ARCHIVE', internetarchive: '📚 ARCHIVE' };
  return [
    `${heads[r.source] || '📄 KNOWLEDGE RESULT'}`,
    '', `Title: ${uv(r.title)}`,
    r.description ? `Summary: ${r.description.slice(0, 500)}` : null,
    `Type: ${uv(r.type)}`,
    `Creator: ${uv(r.creator)}`,
    `Date: ${uv(r.date)}`,
    `License: ${uv(r.license)}`,
    '', citation(r),
  ].filter((l) => l !== null).join('\n');
}

function cardFor(command, r) {
  const type = r.type || '';
  if (type === 'book' || command === 'book' || command === 'author') return cardBook(r);
  if (type === 'research' || command === 'paper' || command === 'research') return cardResearch(r);
  if (type === 'dataset' || command === 'dataset' || command === 'govdata') return cardDataset(r);
  if (type === 'place' || command === 'place' || command === 'mapinfo') return cardPlace(r);
  if (type === 'archive_item') return cardArchive(r);
  if (r.source === 'wikidata' || r.source === 'wdqs') return cardWikidata(r);
  if (r.source === 'wikipedia' || command === 'wiki') return cardWiki(r);
  if (['wikimedia-commons', 'loc', 'europeana', 'picryl'].includes(r.source) && (r.thumbnailUrl || r.contentUrl)) return cardImage(r);
  return cardDefault(r);
}

function newSession(command, query, results) {
  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  SESSIONS.set(id, { command, query, results, cursor: 0, createdAt: Date.now() });
  return id;
}

function pageOf(sessionId) {
  const s = SESSIONS.get(sessionId);
  if (!s || Date.now() - s.createdAt > SESSION_TTL_MS) { SESSIONS.delete(sessionId); return null; }
  const start = s.cursor;
  const items = s.results.slice(start, start + PAGE_SIZE);
  s.cursor += items.length;
  const total = s.results.length;
  return { items, start: start + 1, total, hasMore: s.cursor < total, sessionId };
}

function renderPage(session, command) {
  if (!session.items.length) return 'No results on this page.';
  const cards = session.items.map((r, i) => `[${session.start + i}/${session.total}]\n${cardFor(command, r)}`);
  const nav = session.hasMore ? '\n\n— more results —\nSend `-next` for the next page.' : '\n\n— end of results —';
  return cards.join('\n\n━━━━━━━━━━━━━━\n\n') + nav;
}

let ENGINE = null;

function getEngine() {
  if (ENGINE) return ENGINE;
  const registry = makeRegistry(ENGINE_ROOT);
  const cache = new Cache({ file: path.join(ENGINE_ROOT, 'data', 'cache.json') });
  const health = new HealthManager({ file: path.join(ENGINE_ROOT, 'data', 'health.json') });
  const store = new Store(path.join(ENGINE_ROOT, 'data'));
  const graph = new EntityGraph(store);
  const router = new KnowledgeRouter(registry);
  const engine = new SearchEngine({ registry, cache, health, store, graph, log: () => {} });
  const scheduler = new Scheduler({ registry, health, log: () => {} });
  ENGINE = { registry, cache, health, store, graph, router, engine, scheduler };
  return ENGINE;
}

const SEARCH_COMMANDS = ['wiki', 'wikidata', 'archive', 'archiveall', 'book', 'author', 'document',
  'history', 'newspaper', 'paper', 'research', 'dataset', 'govdata', 'science', 'place',
  'mapinfo', 'oldphoto', 'museum', 'art', 'publicdomain', 'webarchive', 'ai', 'knowledge',
  'searchtext', 'booksearch'];

function isAdmin(ctx) {
  return !!(ctx && (ctx.isAdmin === true || ctx.isOwner === true || ctx.role === 'admin' || ctx.role === 'owner'));
}

async function runSearchCommand(command, query, ctx) {
  const E = getEngine();
  if (!query) return `Usage: -${command} <query>`;
  const route = E.router.routeCommand(command, query);
  if (!route.sources.length) {
    return `No enabled sources for -${command} right now. Try -sourcehealth to see what's available.`;
  }
  const res = await E.engine.search(query, { sourceIds: route.sources, category: route.category });
  if (!res.results.length) {
    const errs = res.errors.length ? `\nSource notes: ${res.errors.map((e) => `${e.sourceId} (${e.status})`).join(', ')}` : '';
    return `No results for "${query}" from ${route.sources.length} sources.${errs}\n\nTry -knowledge ${query} for a broader search.`;
  }
  const sessionId = newSession(command, query, res.results);
  const pg = pageOf(sessionId);
  const header = `🔎 ${command.toUpperCase()} — "${query}"\n${res.results.length} results from ${res.sources.filter((s) => s.status === 'healthy').length}/${res.sources.length} sources (${res.totalMs}ms, ${res.duplicatesRemoved} duplicates removed)\nSession: ${sessionId}\n`;
  return header + '\n' + renderPage(pg, command);
}

async function handleTestSource(id) {
  const E = getEngine();
  const meta = E.registry.get(id);
  if (!meta) return `Unknown source id "${id}".`;
  const started = Date.now();
  try {
    const inst = E.registry.instantiate(id, {});
    const h = await inst.healthCheck();
    let searchNote = 'search: skipped';
    if (meta.implemented) {
      try {
        const rs = await inst.search('test', { limit: 2 });
        searchNote = `search: ${rs.length} result(s)`;
      } catch (e) { searchNote = `search: FAILED (${String(e.message).slice(0, 120)})`; }
    }
    return [
      `🧪 TEST — ${meta.name} (${id})`,
      `Status: ${h.status}`, `Detail: ${h.detail || '—'}`,
      searchNote, `Latency: ${Date.now() - started}ms`,
    ].join('\n');
  } catch (err) {
    return `🧪 TEST — ${id}\nFAILED: ${String(err.message).slice(0, 200)}`;
  }
}

async function handle(rawCmd, rawArgs, ctx) {
  const cmd = String(rawCmd || '').toLowerCase();
  const args = String(rawArgs || '').trim();
  const E = getEngine();

  try {
    if (SEARCH_COMMANDS.includes(cmd)) return await runSearchCommand(cmd, args, ctx);

    if (cmd === 'next' || cmd === 'prev') {
      const sid = args.split(/\s+/)[0];
      const s = SESSIONS.get(sid);
      if (!s) return 'No active session. Run a search first (e.g. -wiki Pakistan).';
      if (cmd === 'prev') s.cursor = Math.max(0, s.cursor - PAGE_SIZE * 2);
      const pg = pageOf(sid);
      if (!pg) return 'Session expired. Run the search again.';
      return renderPage(pg, s.command);
    }

    if (cmd === 'sourcehealth') {
      // Ping only implemented+enabled sources with a light health check.
      const metas = E.registry.list().filter((m) => m.enabled);
      const lines = [];
      for (const m of metas.slice(0, 100)) {
        let icon = '🚧', status = m.implemented ? 'unknown' : (m.status || 'not_implemented');
        if (m.implemented) {
          try {
            const inst = E.registry.instantiate(m.id, {});
            const h = await inst.healthCheck();
            status = h.status;
            const ICON = { healthy: '✅', degraded: '⚠️', timeout: '⏱️', auth_required: '🔑', rate_limited: '🐢', changed: '🔄', inactive: '⛔', license_unknown: '❓', not_implemented: '🚧', unknown: '❔' };
            icon = ICON[status] || '❔';
          } catch (_) { icon = '⚠️'; status = 'degraded'; }
        }
        lines.push(`${m.id.padEnd(28)} ${icon} ${status}`);
      }
      return '📊 SOURCE HEALTH\n\n' + lines.join('\n');
    }

    if (cmd === 'testsource') {
      if (!args) return 'Usage: -testsource <source-id>';
      return await handleTestSource(args.split(/\s+/)[0]);
    }

    if (cmd === 'testall') {
      const metas = E.registry.list();
      let ok = 0, failed = 0, stub = 0;
      const fails = [];
      for (const m of metas) {
        if (!m.implemented) { stub += 1; continue; }
        try {
          const inst = E.registry.instantiate(m.id, {});
          const h = await inst.healthCheck();
          if (['healthy', 'degraded'].includes(h.status)) ok += 1;
          else { failed += 1; fails.push(`${m.id} (${h.status})`); }
        } catch (e) { failed += 1; fails.push(`${m.id} (error)`); }
      }
      return [
        '🧪 TEST ALL SOURCES',
        `Total: ${metas.length}`,
        `Healthy/degraded: ${ok}`,
        `Failed: ${failed}`,
        `Stubs (not implemented): ${stub}`,
        fails.length ? `Failures: ${fails.slice(0, 20).join(', ')}` : null,
      ].filter(Boolean).join('\n');
    }

    // ---- Admin only ----
    if (cmd === 'ingest' || cmd === 'ingeststatus' || cmd === 'ingestpause' || cmd === 'ingestresume' || cmd === 'ingeststop') {
      if (!isAdmin(ctx)) return '⛔ Admin only.';
      if (cmd === 'ingeststatus') {
        if (!INGEST_JOBS.size) return 'No ingest jobs.';
        return Array.from(INGEST_JOBS.entries()).map(([k, v]) => `${k}: ${v.status} (started ${v.startedAt})`).join('\n');
      }
      if (cmd === 'ingeststop' || cmd === 'ingestpause') {
        const id = args.split(/\s+/)[0];
        const j = INGEST_JOBS.get(id);
        if (!j) return `No ingest job for "${id}".`;
        j.status = cmd === 'ingeststop' ? 'stopped' : 'paused';
        return `Ingest ${id}: ${j.status}.`;
      }
      if (cmd === 'ingestresume') {
        const id = args.split(/\s+/)[0];
        const j = INGEST_JOBS.get(id);
        if (!j) return `No ingest job for "${id}".`;
        j.status = 'running';
        return `Ingest ${id}: resumed.`;
      }
      const id = args.split(/\s+/)[0];
      if (!id) return 'Usage: -ingest <source>';
      const meta = E.registry.get(id);
      if (!meta) return `Unknown source "${id}".`;
      if (!meta.implemented) return `Source "${id}" is not implemented — nothing to ingest.`;
      if (!meta.capabilities || !meta.capabilities.bulk) {
        return `⛔ "${id}" offers no official bulk dataset/dump. Bulk ingestion is only allowed for sources with official dumps (§16).`;
      }
      INGEST_JOBS.set(id, { status: 'running', startedAt: new Date().toISOString(), detail: 'bulk ingest registered — run the source-specific ingest script (see README)' });
      E.store.insert('knowledge_ingest_runs', { source: id, status: 'started' });
      return `📥 Ingest job registered for "${id}". Bulk mode is separate from interactive search (§15). Configure the dump URL in .env and run the ingest worker.`;
    }

    if (cmd === 'source') {
      if (!isAdmin(ctx)) return '⛔ Admin only.';
      const [sub, target] = args.split(/\s+/);
      if (!['enable', 'disable', 'test', 'info'].includes(sub) || !target) {
        return 'Usage: -source enable|disable|test|info <source-id>';
      }
      const meta = E.registry.get(target);
      if (!meta) return `Unknown source "${target}".`;
      if (sub === 'enable' || sub === 'disable') {
        E.registry.setEnabled(target, sub === 'enable');
        return `Source "${target}" ${sub === 'enable' ? 'enabled ✅' : 'disabled ⛔'}.`;
      }
      if (sub === 'test') return await handleTestSource(target);
      return [
        `ℹ️ ${meta.name} (${meta.id})`,
        `Category: ${meta.category}`, `Transport: ${meta.transport}`,
        `Base: ${meta.baseUrl}`, `Docs: ${meta.docsUrl || 'unknown'}`,
        `Implemented: ${meta.implemented ? 'yes' : 'no'} (${meta.status || 'unknown'})`,
        meta.requiresKey ? `Requires key: ${(meta.envKeys || []).join(', ')}` : 'No key required',
        `Capabilities: ${Object.entries(meta.capabilities || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
        `Description: ${meta.description || '—'}`,
      ].join('\n');
    }

    return null; // not our command
  } catch (err) {
    return `⚠️ Error: ${String(err && err.message ? err.message : err).slice(0, 300)}`;
  }
}

module.exports = {
  name: 'open-knowledge',
  prefix: '-',
  commands: SEARCH_COMMANDS.concat(['next', 'prev', 'sourcehealth', 'testsource', 'testall', 'ingest', 'ingeststatus', 'ingestpause', 'ingestresume', 'ingeststop', 'source']),
  handle,
  // exposed for tests
  _internals: { getEngine, cardFor, citation },
};
