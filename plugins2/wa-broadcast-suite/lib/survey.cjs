// Smart surveys: after a campaign message, ask follow-up questions one at a
// time, collect replies, and tally results to Excel.
const { bareJid } = require('./util.cjs');

class Survey {
  constructor(id, questions, windowHours = 48) {
    this.id = id;
    this.questions = questions;
    this.pending = new Map(); // jid -> question index
    this.answers = []; // {from, question, answer, at}
    this.deadline = Date.now() + windowHours * 3600 * 1000;
    this.createdAt = new Date().toISOString();
  }

  target(jids) {
    for (const j of (jids || [])) this.pending.set(bareJid(j), 0);
  }

  // returns true if this message was consumed as a survey answer
  record(senderJid, text) {
    const jid = bareJid(senderJid);
    if (!this.pending.has(jid) || Date.now() > this.deadline) return false;
    const t = String(text || '').trim();
    if (!t || t.startsWith('-')) return false; // ignore commands/empties
    const qi = this.pending.get(jid);
    this.answers.push({ from: jid, question: this.questions[qi], answer: t, at: new Date().toISOString() });
    if (qi + 1 < this.questions.length) this.pending.set(jid, qi + 1);
    else this.pending.delete(jid);
    return true;
  }

  nextQuestion(jid) {
    const qi = this.pending.get(bareJid(jid));
    return qi == null ? null : this.questions[qi];
  }

  get remaining() { return this.pending.size; }

  reportRows() {
    return this.answers.map((a) => ({ from: a.from, question: a.question, answer: a.answer, at: a.at }));
  }

  tally() {
    // per question: answer -> count (top values)
    const out = [];
    this.questions.forEach((q, qi) => {
      const counts = {};
      for (const a of this.answers.filter((a) => a.question === q)) {
        const k = a.answer.length > 60 ? a.answer.slice(0, 60) + '…' : a.answer;
        counts[k] = (counts[k] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      out.push({ question: q, responses: Object.values(counts).reduce((x, y) => x + y, 0), top: top.map(([a, n]) => `${a} (${n})`).join(' | ') });
    });
    return out;
  }
}

module.exports = { Survey };
