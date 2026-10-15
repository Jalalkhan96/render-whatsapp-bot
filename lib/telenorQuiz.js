'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

/**
 * Telenor daily quiz service
 * --------------------------
 * - Timezone is ALWAYS Asia/Karachi.
 * - Lazy loading: the first .telanswer request of a new day fetches the quiz.
 * - Cache-first: every later request for the same Karachi date reads the local cache.
 * - Concurrency-safe: 1000/million simultaneous requests share one in-flight fetch.
 * - Midnight rollover: old cache is deleted when the Karachi calendar day changes.
 * - We never cache a source response whose date does not match today's Karachi date.
 *
 * The public answer API below is a third-party source and is not affiliated with
 * Telenor. It is used only as an answer-data source for the bot.
 */

const TIME_ZONE = 'Asia/Karachi';
const CACHE_FILE = path.join(__dirname, '../data/telenorQuizAnswers.json');
const USER_AGENT = process.env.TELENOR_USER_AGENT || 'ABIX-AE Telenor Quiz Reader/3.0';
const REQUEST_TIMEOUT = Number(process.env.TELENOR_REQUEST_TIMEOUT_MS) || 20000;

// Primary source: the API documented by the current Telenor answer provider.
const API_SOURCE_URL = process.env.TELENOR_API_URL || 'https://telenorquiztodays.pk/api/telenor';

// HTML fallbacks. The first two are answer pages that expose all 5 answers.
const HTML_SOURCES = [
  process.env.TELENOR_HTML_SOURCE_URL || 'https://paklivings.pk/my-telenor-answer-today/',
  process.env.TELENOR_HTML_SOURCE_URL_2 || 'https://mytelenoranswertodays.pk/',
  process.env.TELENOR_HTML_SOURCE_URL_3 || 'https://www.ahm7xmakki.com/telenor'
].filter(Boolean);

// Backwards-compatible exports for other bot code.
const SOURCE_URL = HTML_SOURCES[0];
const ANSWER_SOURCE_URL = API_SOURCE_URL;

let fetchPromise = null;
let rolloverTimer = null;
let lastObservedDateKey = localDateKey();

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function formatDateKeyForDisplay(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day, 7, 0, 0)));
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDateKey(value) {
  const text = cleanText(value);
  if (!text) return null;

  // ISO date: 2026-09-26 / 2026-09-26T...
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // English date: 26 September 2026 / September 26, 2026
  const dmy = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (dmy) {
    const parsed = new Date(`${dmy[1]} ${dmy[2]} ${dmy[3]} 00:00:00 GMT+0500`);
    if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed);
  }

  const mdy = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mdy) {
    const parsed = new Date(`${mdy[1]} ${mdy[2]} ${mdy[3]} 00:00:00 GMT+0500`);
    if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed);
  }

  return null;
}

function parseDateKey(value) {
  return normalizeDateKey(value);
}

function extractDateFromText(value) {
  return normalizeDateKey(value);
}

function extractQuestionsFromApi(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Telenor API returned an invalid JSON object');
  }

  const raw = Array.isArray(payload.questions)
    ? payload.questions
    : Array.isArray(payload.data?.questions)
      ? payload.data.questions
      : Array.isArray(payload.result?.questions)
        ? payload.result.questions
        : [];

  if (raw.length < 5) {
    throw new Error(`Telenor API returned only ${raw.length} questions; expected 5`);
  }

  const questions = raw.slice(0, 5).map((item, index) => {
    const question = cleanText(item.question || item.q || item.text);
    const answer = cleanText(item.answer || item.correctAnswer || item.correct_answer || item.correct);
    const options = Array.isArray(item.options)
      ? item.options.map(cleanText).filter(Boolean).slice(0, 4)
      : undefined;

    if (!question || !answer) {
      throw new Error(`Telenor API question #${index + 1} is missing question/answer`);
    }

    return {
      number: String(item.number || index + 1),
      question,
      answer,
      ...(options?.length ? { options } : {})
    };
  });

  const dateKey = extractDateFromText(payload.date || payload.updated || payload.updatedAt || payload.publishedAt || '');
  if (!dateKey) throw new Error('Telenor API did not provide a recognizable quiz date');

  return {
    date: cleanText(payload.date) || formatDateKeyForDisplay(dateKey),
    dateKey,
    fetchedAt: new Date().toISOString(),
    source: API_SOURCE_URL,
    questions,
    answersResolved: true
  };
}

function parseQuizHtml(html) {
  const $ = cheerio.load(html);
  const questions = [];

  // Existing source format: .quiz-content + .quiz-option.correct
  $('.quiz-content').each((_, element) => {
    const questionElement = $(element).find('.quiz-question').first().clone();
    questionElement.find('.question-number').remove();
    const question = cleanText(questionElement.text());
    const answer = cleanText($(element).find('.quiz-option.correct').first().text());
    if (!question || !answer) return;

    const number = cleanText($(element).find('.question-number').first().text()) || String(questions.length + 1);
    questions.push({ number, question, answer });
  });

  if (questions.length >= 5) {
    const title = cleanText($('title').first().text()) || cleanText($('h1').first().text());
    const dateKey = parseDateKey(title) || extractDateFromText($('.updated, time').first().text()) || localDateKey();
    return {
      date: title.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/)?.[1] || formatDateKeyForDisplay(dateKey),
      dateKey,
      fetchedAt: new Date().toISOString(),
      source: SOURCE_URL,
      questions: questions.slice(0, 5),
      answersResolved: true
    };
  }

  // Generic fallback: parse h3 question blocks with an explicit "Correct Answer".
  return parseAnswerHtml(html);
}

function parseAnswerHtml(html, sourceUrl = SOURCE_URL) {
  const $ = cheerio.load(html);
  const questions = [];

  // Format used by several current answer pages:
  // Question heading -> options -> Correct Answer.
  $('h3').each((_, element) => {
    if (questions.length >= 5) return;
    const heading = cleanText($(element).text());
    if (!heading) return;

    const question = heading.replace(/^(?:Q(?:uestion)?\s*)?\d+\s*[:.)-]?\s*/i, '').trim();
    if (!question || question.length < 8) return;

    let answer = '';
    const options = [];
    let node = $(element).next();

    while (node.length && !['h2', 'h3'].includes(String(node[0].name).toLowerCase())) {
      const text = cleanText(node.text());
      if (text) {
        const answerMatch = text.match(/(?:Correct\s*Answer|Answer)\s*[:：]\s*(.+)$/i);
        if (answerMatch) answer = cleanText(answerMatch[1]);

        // Capture simple option rows such as A Elephant / B Camel / C Giraffe.
        const optionMatch = text.match(/^[A-D]\s*[).:-]?\s*(.+)$/i);
        if (optionMatch) options.push(cleanText(optionMatch[1]));
      }
      node = node.next();
    }

    if (answer) {
      questions.push({
        number: String(questions.length + 1),
        question,
        answer,
        ...(options.length ? { options: [...new Set(options)].slice(0, 4) } : {})
      });
    }
  });

  // Table fallback: Question | Correct Answer.
  if (questions.length < 5) {
    $('table tr').each((_, row) => {
      if (questions.length >= 5) return;
      const cells = $(row).find('th,td').map((__, cell) => cleanText($(cell).text())).get().filter(Boolean);
      if (cells.length >= 2 && /^\d+$/.test(cells[0]) && cells[1] && !/question/i.test(cells[1])) {
        questions.push({ number: cells[0], question: cells[1], answer: cells[2] || '' });
      }
    });
  }

  if (questions.length < 5) {
    throw new Error(`Telenor answer page yielded ${questions.length} usable questions; expected 5`);
  }

  const title = cleanText($('title').first().text()) || cleanText($('h1').first().text());
  const dateKey = parseDateKey(title) || extractDateFromText($('.updated, time').first().text());
  if (!dateKey) throw new Error(`Could not determine quiz date from ${sourceUrl}`);

  return {
    date: title.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/)?.[1] || formatDateKeyForDisplay(dateKey),
    dateKey,
    fetchedAt: new Date().toISOString(),
    questions: questions.slice(0, 5),
    source: sourceUrl,
    answersResolved: true
  };
}

function validateFreshData(data, expectedDateKey = localDateKey()) {
  if (!data || !Array.isArray(data.questions) || data.questions.length !== 5) {
    throw new Error('Telenor data must contain exactly 5 questions');
  }
  if (!data.dateKey || data.dateKey !== expectedDateKey) {
    throw new Error(`Source is stale: source date ${data?.dateKey || 'unknown'}, today in Asia/Karachi is ${expectedDateKey}`);
  }
  for (const [index, item] of data.questions.entries()) {
    if (!cleanText(item.question) || !cleanText(item.answer)) {
      throw new Error(`Telenor question #${index + 1} is incomplete`);
    }
  }
  return data;
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (!Array.isArray(data?.questions)) return null;
    return data;
  } catch (error) {
    console.warn('[Telenor] cache read failed:', error.message);
    return null;
  }
}

function deleteCache(reason = 'daily rollover') {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      console.log(`[Telenor] old quiz cache deleted (${reason})`);
    }
  } catch (error) {
    console.warn('[Telenor] could not delete cache:', error.message);
  }
}

function writeCache(data) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const temporary = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, CACHE_FILE);
}

async function fetchText(url) {
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    maxContentLength: 4 * 1024 * 1024,
    maxRedirects: 8,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://telenor.com.pk/'
    },
    validateStatus: status => status >= 200 && status < 400
  });
  return response.data;
}

async function fetchApiSource(expectedDateKey) {
  const data = await fetchText(API_SOURCE_URL);
  const payload = typeof data === 'string' ? JSON.parse(data) : data;
  return validateFreshData(extractQuestionsFromApi(payload), expectedDateKey);
}

async function fetchHtmlSource(url, expectedDateKey) {
  const html = await fetchText(url);
  return validateFreshData(parseAnswerHtml(html, url), expectedDateKey);
}

async function fetchQuiz() {
  const expectedDateKey = localDateKey();
  const errors = [];

  // 1) API source: fastest and least HTML-sensitive.
  try {
    const data = await fetchApiSource(expectedDateKey);
    return data;
  } catch (error) {
    errors.push(`API ${API_SOURCE_URL}: ${error.message}`);
  }

  // 2) HTML fallbacks.
  for (const url of HTML_SOURCES) {
    try {
      const data = await fetchHtmlSource(url, expectedDateKey);
      return data;
    } catch (error) {
      errors.push(`HTML ${url}: ${error.message}`);
    }
  }

  throw new Error(`No fresh Telenor quiz available for ${expectedDateKey}. ${errors.join(' | ')}`);
}

function isCacheForToday(data, today = localDateKey()) {
  return Boolean(
    data &&
    data.dateKey === today &&
    Array.isArray(data.questions) &&
    data.questions.length === 5 &&
    data.answersResolved !== false
  );
}

function ensureDateRollover() {
  const today = localDateKey();
  if (today === lastObservedDateKey) return today;

  // The process crossed midnight in Karachi. Delete yesterday's file immediately.
  deleteCache(`Asia/Karachi date changed ${lastObservedDateKey} -> ${today}`);
  lastObservedDateKey = today;
  return today;
}

function scheduleMidnightRollover() {
  if (rolloverTimer) clearTimeout(rolloverTimer);

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

  // Asia/Karachi is UTC+05:00 and does not observe DST.
  const karachiNowUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) - 5, Number(parts.minute), Number(parts.second)
  );
  const nextMidnightUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, -5, 0, 0
  );
  const delay = Math.max(1000, nextMidnightUtc - karachiNowUtc);

  rolloverTimer = setTimeout(() => {
    const today = localDateKey();
    if (today !== lastObservedDateKey) {
      deleteCache(`scheduled Asia/Karachi midnight rollover -> ${today}`);
      lastObservedDateKey = today;
    }
    scheduleMidnightRollover();
  }, delay);

  rolloverTimer.unref?.();
}

async function refreshQuiz({ force = false } = {}) {
  const today = ensureDateRollover();
  const cached = readCache();

  if (!force && isCacheForToday(cached, today)) {
    return { data: cached, updated: false, cacheHit: true };
  }

  if (cached && cached.dateKey !== today) {
    deleteCache(`stale cache ${cached.dateKey} != ${today}`);
  }

  // Only ONE network fetch is allowed at a time. All concurrent callers await it.
  if (fetchPromise) {
    const data = await fetchPromise;
    return { data, updated: true, cacheHit: false, sharedFetch: true };
  }

  fetchPromise = (async () => {
    const fresh = await fetchQuiz();
    writeCache(fresh);
    return fresh;
  })();

  try {
    const data = await fetchPromise;
    return { data, updated: true, cacheHit: false, sharedFetch: false };
  } finally {
    fetchPromise = null;
  }
}

scheduleMidnightRollover();

module.exports = {
  TIME_ZONE,
  SOURCE_URL,
  ANSWER_SOURCE_URL,
  API_SOURCE_URL,
  HTML_SOURCES,
  CACHE_FILE,
  localDateKey,
  formatDateKeyForDisplay,
  parseDateKey,
  parseQuizHtml,
  parseAnswerHtml,
  extractQuestionsFromApi,
  validateFreshData,
  readCache,
  writeCache,
  deleteCache,
  fetchQuiz,
  refreshQuiz,
  isCacheForToday
};
