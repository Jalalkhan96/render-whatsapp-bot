const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "..", "data", "apify-key-state.json");

class ApifyKeyRotator {
  constructor(tokens) {
    this.tokens = tokens.map((t, i) => ({
      id: `key_${i + 1}`,
      token: t,
      cooldownUntil: 0,
      cooldownReason: null,
      failCount: 0,
      successCount: 0,
      lastUsedAt: null,
    }));
    this.index = 0;
    this._loadState();
    console.log(
      `[apify-rotator] Initialized with ${this.tokens.length} key(s): ${this.tokens
        .map((t) => t.id)
        .join(", ")}`
    );
  }

  _loadState() {
    try {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      this.tokens.forEach((entry) => {
        if (saved[entry.id]) {
          entry.cooldownUntil = saved[entry.id].cooldownUntil || 0;
          entry.cooldownReason = saved[entry.id].cooldownReason || null;
          entry.failCount = saved[entry.id].failCount || 0;
        }
      });
      console.log("[apify-rotator] Loaded persisted cooldown state");
    } catch {
      console.log("[apify-rotator] No prior state file found, starting fresh");
    }
  }

  _saveState() {
    const state = {};
    this.tokens.forEach((entry) => {
      state[entry.id] = {
        cooldownUntil: entry.cooldownUntil,
        cooldownReason: entry.cooldownReason,
        failCount: entry.failCount,
      };
    });
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  getNextAvailable() {
    const now = Date.now();
    for (let i = 0; i < this.tokens.length; i++) {
      const idx = (this.index + i) % this.tokens.length;
      const entry = this.tokens[idx];
      if (entry.cooldownUntil < now) {
        if (entry.cooldownReason) {
          console.log(`[apify-rotator] ${entry.id} cooldown expired, back in rotation`);
          entry.cooldownReason = null;
        }
        this.index = (idx + 1) % this.tokens.length;
        return entry;
      }
    }
    return null;
  }

  markExhausted(entry, cooldownMs, reason) {
    entry.cooldownUntil = Date.now() + cooldownMs;
    entry.cooldownReason = reason;
    entry.failCount++;
    this._saveState();
    console.warn(
      `[apify-rotator] ${entry.id} EXHAUSTED (reason: ${reason}). ` +
        `Cooling down until ${new Date(entry.cooldownUntil).toISOString()} ` +
        `(failCount=${entry.failCount})`
    );
  }

  markSuccess(entry) {
    entry.successCount++;
    entry.lastUsedAt = new Date().toISOString();
  }

  markPermanentlyDead(entry, reason) {
    entry.cooldownUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
    entry.cooldownReason = reason;
    this._saveState();
    console.error(
      `[apify-rotator] ${entry.id} marked PERMANENTLY DEAD (reason: ${reason}). Fix the token in .env.`
    );
  }

  status() {
    const now = Date.now();
    return this.tokens.map((e) => ({
      id: e.id,
      available: e.cooldownUntil < now,
      cooldownReason: e.cooldownReason,
      cooldownRemainingMs: Math.max(0, e.cooldownUntil - now),
      failCount: e.failCount,
      successCount: e.successCount,
      lastUsedAt: e.lastUsedAt,
    }));
  }
}

const tokens = Object.keys(process.env)
  .filter((k) => /^APIFY_TOKEN_\d+$/.test(k))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((k) => process.env[k])
  .filter(Boolean);

if (tokens.length === 0) {
  throw new Error("[apify-rotator] No APIFY_TOKEN_n vars found in .env — set at least APIFY_TOKEN_1");
}

module.exports = new ApifyKeyRotator(tokens);
