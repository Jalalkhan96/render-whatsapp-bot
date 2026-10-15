// WhatsApp number warmer: gradually ramps a new line with natural,
// human-like messages to YOUR OWN seed numbers/groups so the line builds
// trust before any campaign. Never point this at strangers.
const { sleep, rand } = require('./util.cjs');

const DEFAULT_PLAN = [
  { day: 1, messages: 10 },
  { day: 2, messages: 20 },
  { day: 3, messages: 35 },
  { day: 4, messages: 55 },
  { day: 5, messages: 80 },
  { day: 6, messages: 110 },
  { day: 7, messages: 150 },
];

const WARM_TEXTS = [
  'Hey! How are you doing today?',
  'Just checking in — all good on your side?',
  'Did you see the match last night? Crazy finish!',
  'Morning! Hope you have a great day.',
  'Are we still on for the weekend plan?',
  'Haha that meme you sent was too good.',
  'Let me know when you are free to talk.',
  'Good evening! How did your day go?',
  'I found that shop you were asking about.',
  'Thanks for your help earlier, really appreciate it.',
  'What time should I come over tomorrow?',
  'This weather is perfect for chai, no?',
];

class Warmer {
  constructor() { this.running = false; this.stopFlag = false; }
  stop() { this.stopFlag = true; }

  async runDay({ send, seeds, day = 1, plan = DEFAULT_PLAN, onEvent = () => {} }) {
    if (this.running) throw new Error('Warmer already running');
    const step = plan.find((p) => p.day === day) || plan[plan.length - 1];
    this.running = true;
    this.stopFlag = false;
    const emit = (e) => { try { onEvent(e); } catch (_) {} };
    let sent = 0;
    try {
      for (let i = 0; i < step.messages; i++) {
        if (this.stopFlag) break;
        const seed = seeds[i % seeds.length];
        const text = WARM_TEXTS[Math.floor(Math.random() * WARM_TEXTS.length)];
        try {
          await send(seed, { text });
          sent++;
          emit({ type: 'sent', done: sent, total: step.messages, to: seed });
        } catch (e) {
          emit({ type: 'failed', error: String(e?.message || e) });
        }
        if (i + 1 < step.messages) await sleep(rand(120, 480) * 1000); // 2-8 min natural gaps
      }
    } finally {
      this.running = false;
    }
    emit({ type: 'done', day, sent, planned: step.messages, stopped: this.stopFlag });
    return { day, sent, planned: step.messages, stopped: this.stopFlag };
  }
}

module.exports = { Warmer, DEFAULT_PLAN };
