"use strict";

/**
 * rlnmardan.js
 * BISE Mardan online roll-number-slip lookup.
 *
 * Command:
 *   -rlnmardan
 *
 * The command starts a two-step conversation:
 *   1) Student name
 *   2) Father name
 *
 * The actual lookup follows the public BISE Mardan roll-number-slip portal's
 * form flow.  Node 20+ global fetch is used; no extra npm dependency is
 * required.
 */

const BASE = "https://rollno.bisemdn.edu.pk";
const API_PATH = "/incl/sql_load.php";
const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_NAME = 120;
const MAX_DELAYED_SESSIONS = 200;

const DEFAULTS = Object.freeze({
  examCode: process.env.RLMARDAN_EXAM_CODE || "52",
  year: process.env.RLMARDAN_YEAR || "2026",
  session: process.env.RLMARDAN_SESSION || "2",
  module: process.env.RLMARDAN_MODULE || "ssc",
});

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const sessions = new Map();

function textOf(message) {
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    ""
  ).trim();
}

function sessionKey(message) {
  const chat = String(message?.key?.remoteJid || "");
  const sender = String(
    message?.key?.participant || message?.key?.senderPn || chat
  );
  return `${chat}|${sender}`;
}

function sweepSessions() {
  const now = Date.now();
  for (const [key, state] of sessions) {
    if (now - state.updatedAt > SESSION_TTL_MS) sessions.delete(key);
  }
  while (sessions.size > MAX_DELAYED_SESSIONS) {
    const first = sessions.keys().next().value;
    if (!first) break;
    sessions.delete(first);
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  storeFrom(response) {
    let lines = [];
    if (typeof response?.headers?.getSetCookie === "function") {
      lines = response.headers.getSetCookie();
    } else {
      const raw = response?.headers?.get("set-cookie");
      if (raw) lines = [raw];
    }

    for (const line of lines) {
      const pair = String(line).split(";")[0].trim();
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

async function openSession() {
  const jar = new CookieJar();
  const response = await fetch(`${BASE}/`, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`BISE Mardan portal returned HTTP ${response.status}`);
  }

  jar.storeFrom(response);
  await response.text();
  return jar;
}

async function lookupSlip(jar, name, fatherName) {
  const params = new URLSearchParams({
    mode: "SearchRollNo",
    module: DEFAULTS.module,
  });

  const body = new URLSearchParams({
    ExamCode: DEFAULTS.examCode,
    Year: DEFAULTS.year,
    Session: DEFAULTS.session,
    Name: name,
    FName: fatherName,
  });

  const response = await fetch(`${BASE}${API_PATH}?${params.toString()}`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/`,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: jar.header(),
      Accept: "text/html,application/xhtml+xml",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });

  jar.storeFrom(response);
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Roll-number search returned HTTP ${response.status}`);
  }
  return html;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : _;
    });
}

function stripTags(html) {
  return decodeEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:tr|p|div|li|h[1-6]|table|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSlipHtml(html) {
  const source = String(html || "");
  const open = source.match(/<div[^>]*\bid=["']rno_slip["'][^>]*>/i);
  if (!open || open.index == null) return null;

  const start = open.index + open[0].length;
  let depth = 1;
  const divs = /<\/?div\b[^>]*>/gi;
  divs.lastIndex = start;
  let match;
  while ((match = divs.exec(source))) {
    if (/^<\//.test(match[0])) depth--;
    else depth++;
    if (depth === 0) return source.slice(start, match.index);
  }
  return source.slice(start);
}

function normalizeLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\s:：-]+$/g, "")
    .trim()
    .toLowerCase();
}

function cleanValue(value) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function extractTablePairs(html) {
  const pairs = {};
  const rowRx = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRx.exec(html))) {
    const cells = [];
    const cellRx = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cell;
    while ((cell = cellRx.exec(row[1]))) cells.push(cleanValue(cell[1]));
    if (cells.length < 2) continue;

    const label = normalizeLabel(cells[0]);
    const value = cells.slice(1).join(" ").trim();
    if (label && value && !pairs[label]) pairs[label] = value;
  }
  return pairs;
}

function fromPairs(pairs, variants) {
  for (const variant of variants) {
    if (pairs[normalizeLabel(variant)]) return pairs[normalizeLabel(variant)];
  }
  return null;
}

function fromText(text, variants) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const label of variants) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.match(new RegExp(`^${escaped}\\s*[:：-]\\s*(.+)$`, "i"));
      if (match?.[1]?.trim()) return match[1].trim();
    }
  }
  return null;
}

function parseSlip(html) {
  const source = String(html || "");
  const text = stripTags(source);

  if (!source.trim()) {
    return { found: false, error: "BISE Mardan returned an empty response." };
  }

  if (!/id=["']rno_slip["']/i.test(source)) {
    const alert = text.match(/(?:alert|error|message)[^\n]*\n?([^\n]+)?/i)?.[1];
    return {
      found: false,
      error: /no student|not found|record not found|no record/i.test(text)
        ? "No student record found for this name and father name."
        : cleanValue(alert || "No roll-number slip was returned by BISE Mardan."),
    };
  }

  const slipHtml = extractSlipHtml(source) || source;
  const slipText = stripTags(slipHtml);
  const pairs = extractTablePairs(slipHtml);

  const data = {
    rollNo: fromPairs(pairs, ["Roll No", "Roll Number", "R.No", "R No"]) ||
      fromText(slipText, ["Roll No", "Roll Number", "R.No", "R No"]),
    name: fromPairs(pairs, ["Name", "Student Name", "Candidate Name"]) ||
      fromText(slipText, ["Student Name", "Candidate Name", "Name"]),
    fatherName: fromPairs(pairs, ["Father Name", "Father's Name", "F.Name", "F Name"]) ||
      fromText(slipText, ["Father Name", "Father's Name", "F.Name", "F Name"]),
    exam: fromPairs(pairs, ["Exam", "Examination"]) ||
      fromText(slipText, ["Exam", "Examination"]),
    year: fromPairs(pairs, ["Year"]) || fromText(slipText, ["Year"]),
    session: fromPairs(pairs, ["Session"]) || fromText(slipText, ["Session"]),
    centre: fromPairs(pairs, ["Centre", "Center", "Exam Centre", "Examination Centre"]) ||
      fromText(slipText, ["Centre", "Center", "Exam Centre", "Examination Centre"]),
  };

  return { found: true, data, rawText: slipText };
}

function formatResult(parsed, requestedName, requestedFather) {
  if (!parsed.found) {
    return (
      `❌ *BISE MARDAN — ROLL NO NOT FOUND*\n\n` +
      `👤 Name: *${requestedName}*\n` +
      `👨 Father: *${requestedFather}*\n\n` +
      `${parsed.error || "No matching record was returned."}\n\n` +
      `🔗 ${BASE}/`
    );
  }

  const d = parsed.data || {};
  const lines = [
    "✅ *BISE MARDAN — ROLL NUMBER SLIP*",
    "",
    `🪪 *Roll No:* ${d.rollNo || "N/A"}`,
    `👤 *Name:* ${d.name || requestedName}`,
    `👨 *Father Name:* ${d.fatherName || requestedFather}`,
    `📝 *Exam:* ${d.exam || "N/A"}`,
    `📅 *Year:* ${d.year || DEFAULTS.year}`,
    `🎓 *Session:* ${d.session || DEFAULTS.session}`,
    `🏫 *Centre:* ${d.centre || "N/A"}`,
    "",
    `🔗 *Official portal:* ${BASE}/`,
  ];
  return lines.join("\n");
}

async function startLookup(sock, message, context = {}) {
  sweepSessions();
  const chatId = context.chatId || message?.key?.remoteJid;
  if (!chatId) return;

  const key = sessionKey(message);
  sessions.set(key, {
    step: "name",
    name: null,
    fatherName: null,
    updatedAt: Date.now(),
  });

  await sock.sendMessage(
    chatId,
    {
      text:
        `🪪 *BISE MARDAN ROLL NO FINDER*\n\n` +
        `*Step 1/2 — Student Name*\n` +
        `Apna full name bhejo.\n\n` +
        `Example: *AHMAD ALI*\n\n` +
        `Type *cancel* to stop.`,
    },
    { quoted: message }
  );
}

async function handlePendingRollnoMessage(sock, message) {
  sweepSessions();
  const key = sessionKey(message);
  const state = sessions.get(key);
  if (!state) return false;

  const chatId = message?.key?.remoteJid;
  const text = textOf(message);
  if (!chatId || !text) return false;

  // Let a fresh command restart the flow instead of treating it as a name.
  if (/^-rlnmardan\b/i.test(text)) return false;

  if (text.toLowerCase() === "cancel") {
    sessions.delete(key);
    await sock.sendMessage(chatId, { text: "❌ Roll-number search cancelled." }, { quoted: message });
    return true;
  }

  if (text.length < 2 || text.length > MAX_NAME) {
    await sock.sendMessage(
      chatId,
      { text: `⚠️ Please send a valid name (2–${MAX_NAME} characters).` },
      { quoted: message }
    );
    return true;
  }

  state.updatedAt = Date.now();

  if (state.step === "name") {
    state.name = text.replace(/\s+/g, " ").trim();
    state.step = "father";
    await sock.sendMessage(
      chatId,
      {
        text:
          `✅ Student name saved: *${state.name}*\n\n` +
          `*Step 2/2 — Father Name*\n` +
          `Ab father ka full name bhejo.\n\n` +
          `Example: *MUHAMMAD ALI*\n\n` +
          `Type *cancel* to stop.`,
      },
      { quoted: message }
    );
    return true;
  }

  state.fatherName = text.replace(/\s+/g, " ").trim();
  const name = state.name;
  const fatherName = state.fatherName;
  sessions.delete(key);

  await sock.sendMessage(chatId, { text: "🔎 BISE Mardan se roll number search ho raha hai…" }, { quoted: message });

  try {
    const jar = await openSession();
    const html = await lookupSlip(jar, name, fatherName);
    const parsed = parseSlip(html);
    await sock.sendMessage(
      chatId,
      { text: formatResult(parsed, name, fatherName) },
      { quoted: message }
    );
  } catch (error) {
    console.error("[RLMARDAN]", error);
    await sock.sendMessage(
      chatId,
      {
        text:
          `❌ *BISE Mardan lookup failed*\n\n` +
          `${error?.message || "Unknown portal error"}\n\n` +
          `Please try again later or use the official portal:\n${BASE}/`,
      },
      { quoted: message }
    );
  }

  return true;
}

module.exports = {
  command: "rlnmardan",
  aliases: [],
  category: "education",
  description: "Find BISE Mardan roll number by student name and father name",
  usage: "-rlnmardan",
  async handler(sock, message, args = [], context = {}) {
    // Direct one-line mode is optional and useful when automation/testing needs
    // it: -rlnmardan "Student Name" | "Father Name"
    const input = args.join(" ").trim();
    if (input.includes("|")) {
      const [nameRaw, fatherRaw] = input.split("|").map((x) => x.trim());
      if (!nameRaw || !fatherRaw) {
        return sock.sendMessage(
          context.chatId || message.key.remoteJid,
          { text: "Usage: -rlnmardan Student Name | Father Name" },
          { quoted: message }
        );
      }
      const name = nameRaw.slice(0, MAX_NAME);
      const fatherName = fatherRaw.slice(0, MAX_NAME);
      await sock.sendMessage(context.chatId || message.key.remoteJid, { text: "🔎 BISE Mardan se roll number search ho raha hai…" }, { quoted: message });
      try {
        const jar = await openSession();
        const html = await lookupSlip(jar, name, fatherName);
        const parsed = parseSlip(html);
        return sock.sendMessage(
          context.chatId || message.key.remoteJid,
          { text: formatResult(parsed, name, fatherName) },
          { quoted: message }
        );
      } catch (error) {
        return sock.sendMessage(
          context.chatId || message.key.remoteJid,
          { text: `❌ *BISE Mardan lookup failed*\n\n${error?.message || "Unknown portal error"}` },
          { quoted: message }
        );
      }
    }

    return startLookup(sock, message, context);
  },

  // The message handler calls this before normal command dispatch so the
  // second and third messages in the conversation are consumed by this plugin.
  handlePendingRollnoMessage,
  _sessions: sessions,
  _internals: { parseSlip, stripTags, openSession, lookupSlip, DEFAULTS },
};
