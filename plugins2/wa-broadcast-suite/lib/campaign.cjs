// Bulk campaign engine: Excel/CSV contact import, {variable} templates,
// media attachments, randomized human-like delays, batch pauses, multi-line
// round-robin queue, pause/resume/stop, resume-safe state, delivery receipts.
const fs = require('fs');
const path = require('path');
const { sleep, rand, normPhone, toJid } = require('./util.cjs');

function renderTemplate(tpl, vars) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k] ?? vars[k.toLowerCase()] ?? vars[k.toUpperCase()];
    return v == null ? '' : String(v);
  });
}

class Campaign {
  constructor(id, dataDir) {
    this.id = id;
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'campaigns', `${id}.json`);
    this.contacts = [];
    this.results = []; // {phone,status,messageId?,line?,error?,at?}
    this.status = 'idle'; // idle|running|paused|stopped|done
    this.startedAt = null;
    this.finishedAt = null;
    this.stopped = false;
    this.lineCursor = 0;
  }

  // rows: objects from Excel. Uses phone/Phone/number/Number/mobile column.
  loadContacts(rows) {
    const list = rows.map((r) => {
      const phone = normPhone(r.phone ?? r.Phone ?? r.number ?? r.Number ?? r.mobile ?? r.Mobile);
      if (!phone) return null;
      return { phone, jid: toJid(phone), vars: { ...r } };
    }).filter(Boolean);
    const seen = new Set();
    this.contacts = list.filter((c) => (seen.has(c.phone) ? false : (seen.add(c.phone), true)));
    this.save();
    return this.contacts.length;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({
      id: this.id, status: this.status, startedAt: this.startedAt,
      finishedAt: this.finishedAt, contacts: this.contacts, results: this.results,
    }, null, 2));
  }

  static load(id, dataDir) {
    const file = path.join(dataDir, 'campaigns', `${id}.json`);
    if (!fs.existsSync(file)) return null;
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const c = new Campaign(id, dataDir);
    Object.assign(c, { contacts: d.contacts || [], results: d.results || [], status: d.status || 'idle', startedAt: d.startedAt || null, finishedAt: d.finishedAt || null });
    return c;
  }

  pickLine(lines) {
    const avail = (lines || []).filter((l) => l.sock && l.ready);
    if (!avail.length) return null;
    const line = avail[this.lineCursor % avail.length];
    this.lineCursor += 1;
    return line;
  }

  async buildContent(contact, opts) {
    const text = renderTemplate(opts.message, contact.vars);
    if (!opts.media) return { text };
    const m = opts.media; // {path, type}
    if (!fs.existsSync(m.path)) throw new Error('Media file not found: ' + m.path);
    const src = { url: m.path };
    switch (m.type) {
      case 'image': return { image: src, caption: text };
      case 'video': return { video: src, caption: text };
      case 'audio': return { audio: src, mimetype: 'audio/mp4', ptt: false };
      case 'document':
      default:
        return { document: src, mimetype: m.mimetype || 'application/octet-stream', fileName: path.basename(m.path), caption: text || undefined };
    }
  }

  async start(opts) {
    // opts: { send(line,jid,content)->{messageId}, lines, message, media?,
    //         delayMin, delayMax (sec), batchSize, batchPauseSec, onEvent }
    if (this.status === 'running') throw new Error('Campaign already running');
    this.status = 'running';
    this.stopped = false;
    this.startedAt = this.startedAt || new Date().toISOString();
    const {
      send, lines, message,
      delayMin = 25, delayMax = 70, batchSize = 40, batchPauseSec = 300,
      onEvent = () => {},
    } = opts;
    const emit = (e) => { try { onEvent(e); } catch (_) { /* ignore */ } };

    for (let i = 0; i < this.contacts.length; i++) {
      if (this.stopped) break;
      while (this.status === 'paused' && !this.stopped) await sleep(2000);
      if (this.stopped) break;
      const c = this.contacts[i];
      if (this.results.some((r) => r.phone === c.phone && r.status !== 'failed')) continue; // resume-safe
      const line = this.pickLine(lines);
      if (!line) {
        this.results.push({ phone: c.phone, status: 'failed', error: 'no lines connected', at: new Date().toISOString() });
        emit({ type: 'failed', phone: c.phone, error: 'no lines connected' });
        continue;
      }
      try {
        const content = await this.buildContent(c, opts);
        const { messageId } = await send(line, c.jid, content);
        this.results.push({ phone: c.phone, status: 'sent', messageId, line: line.id, at: new Date().toISOString() });
        emit({ type: 'sent', phone: c.phone, line: line.id, done: this.results.length, total: this.contacts.length });
      } catch (err) {
        this.results.push({ phone: c.phone, status: 'failed', error: String(err?.message || err), line: line.id, at: new Date().toISOString() });
        emit({ type: 'failed', phone: c.phone, error: String(err?.message || err) });
      }
      if ((i + 1) % 10 === 0) this.save();
      const last = i + 1 >= this.contacts.length;
      if (!last && batchSize > 0 && (i + 1) % batchSize === 0) {
        const pauseMs = rand(batchPauseSec * 0.7, batchPauseSec * 1.3) * 1000;
        emit({ type: 'batch-pause', seconds: Math.round(pauseMs / 1000) });
        await sleep(pauseMs);
      } else if (!last) {
        await sleep(rand(delayMin, delayMax) * 1000); // intelligent randomized delay
      }
    }
    this.status = this.stopped ? 'stopped' : 'done';
    this.finishedAt = new Date().toISOString();
    this.save();
    const s = this.summary();
    emit({ type: 'done', status: this.status, summary: s });
    return s;
  }

  pause() { if (this.status === 'running') { this.status = 'paused'; this.save(); } }
  resume() { if (this.status === 'paused') { this.status = 'running'; this.save(); } }
  stop() { this.stopped = true; this.status = 'stopped'; this.save(); }

  markReceipt(messageId, level) {
    const r = this.results.find((r) => r.messageId === messageId);
    if (!r) return false;
    if (level === 'read') r.status = 'read';
    else if (level === 'delivered' && r.status === 'sent') r.status = 'delivered';
    return true;
  }

  summary() {
    const s = { total: this.contacts.length, sent: 0, delivered: 0, read: 0, failed: 0, pending: 0 };
    for (const r of this.results) {
      if (r.status === 'sent') s.sent++;
      else if (r.status === 'delivered') { s.sent++; s.delivered++; }
      else if (r.status === 'read') { s.sent++; s.delivered++; s.read++; }
      else if (r.status === 'failed') s.failed++;
    }
    s.pending = s.total - this.results.length;
    return { id: this.id, status: this.status, ...s };
  }

  reportRows() {
    return this.results.map((r) => ({
      phone: r.phone, status: r.status, line: r.line || '',
      message_id: r.messageId || '', error: r.error || '', at: r.at || '',
    }));
  }
}

module.exports = { Campaign, renderTemplate };
