import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/* =====================================================
 * MYINSTANTS CONFIG
 * ===================================================== */

const MYINSTANTS_BASE =
  'https://www.myinstants.com';

const MYINSTANTS_SEARCH =
  `${MYINSTANTS_BASE}/en/search/?name=`;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/153.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT =
  Number(
    process.env.MYINSTANTS_TIMEOUT_MS
  ) || 30_000;

const MAX_SOUND_RESULTS =
  Math.min(
    Math.max(
      Number(
        process.env.MYINSTANTS_MAX_RESULTS
      ) || 10,
      1
    ),
    20
  );

const MAX_SOUND_BYTES =
  Number(
    process.env.MYINSTANTS_MAX_BYTES
  ) || 25 * 1024 * 1024;

/* =====================================================
 * TEXT HELPERS
 * ===================================================== */

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(
          Number(code)
        );
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCharCode(
          parseInt(code, 16)
        );
      } catch {
        return '';
      }
    });
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/* =====================================================
 * FILE HELPERS
 * ===================================================== */

function safeFileName(value) {
  const cleaned =
    String(value || 'sound')
      .replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        ''
      )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);

  return cleaned || 'sound';
}

/* =====================================================
 * URL HELPERS
 * ===================================================== */

function normalizeAudioUrl(value) {
  if (!value) {
    return null;
  }

  let url =
    String(value)
      .trim()
      .replace(/&amp;/gi, '&');

  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  if (url.startsWith('/')) {
    url =
      `${MYINSTANTS_BASE}${url}`;
  }

  if (
    !/^https?:\/\//i.test(url)
  ) {
    url =
      `${MYINSTANTS_BASE}/media/sounds/${url}`;
  }

  return url;
}

function isMp3Url(value) {
  try {
    const url =
      new URL(
        String(value).trim()
      );

    return url.pathname
      .toLowerCase()
      .endsWith('.mp3');
  } catch {
    return false;
  }
}

/* =====================================================
 * HTTP
 * ===================================================== */

async function fetchText(url) {
  const response =
    await fetch(
      url,
      {
        headers: {
          'User-Agent':
            USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language':
            'en-US,en;q=0.9',
          Referer:
            MYINSTANTS_BASE,
        },
        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT
          ),
      }
    );

  if (!response.ok) {
    throw new Error(
      `MYINSTANTS_HTTP_${response.status}`
    );
  }

  return response.text();
}

/* =====================================================
 * MYINSTANTS SEARCH
 * ===================================================== */

export async function searchMyInstants(
  query
) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    throw new Error(
      'EMPTY_SOUND_QUERY'
    );
  }

  const searchUrl =
    `${MYINSTANTS_SEARCH}${encodeURIComponent(
      cleanQuery
    )}`;

  const html =
    await fetchText(
      searchUrl
    );

  const normalized =
    html.replace(
      /\r?\n/g,
      ' '
    );

  const results = [];
  const seen = new Set();

  /* =================================================
   * METHOD 1
   *
   * play('file.mp3', 'id', 'title')
   * ================================================= */

  const playRegex =
    /play\(\s*['"]([^'"]+?\.mp3(?:\?[^'"]*)?)['"]\s*,\s*['"][^'"]*['"]\s*,\s*['"]([^'"]*)['"]\s*\)/gi;

  let match;

  while (
    (match =
      playRegex.exec(
        normalized
      )) !== null
  ) {
    const rawUrl =
      match[1];

    const playName =
      cleanHtmlText(
        match[2]
      );

    const audioUrl =
      normalizeAudioUrl(
        rawUrl
      );

    if (
      !audioUrl ||
      !isMp3Url(audioUrl)
    ) {
      continue;
    }

    if (
      seen.has(audioUrl)
    ) {
      continue;
    }

    seen.add(audioUrl);

    /*
     * Search nearby HTML for the visible
     * MyInstants button title.
     */
    const start =
      Math.max(
        0,
        match.index - 2500
      );

    const end =
      Math.min(
        normalized.length,
        match.index + 4000
      );

    const block =
      normalized.slice(
        start,
        end
      );

    let title = '';

    const titlePatterns = [
      /instant-link[^>]*>\s*([^<]+?)\s*<\/a>/i,
      /instant-link[^>]*title=["']([^"']+)["']/i,
      /aria-label=["']([^"']+)["']/i,
    ];

    for (
      const pattern
      of titlePatterns
    ) {
      const titleMatch =
        block.match(
          pattern
        );

      if (titleMatch) {
        title =
          cleanHtmlText(
            titleMatch[1]
          );

        if (title) {
          break;
        }
      }
    }

    if (!title) {
      title = playName;
    }

    if (!title) {
      try {
        title =
          path.basename(
            new URL(
              audioUrl
            ).pathname,
            '.mp3'
          );
      } catch {
        title = 'Sound';
      }
    }

    results.push({
      index:
        results.length + 1,
      name: title,
      url: audioUrl,
    });

    if (
      results.length >=
      MAX_SOUND_RESULTS
    ) {
      break;
    }
  }

  /* =================================================
   * METHOD 2
   *
   * Direct /media/sounds/*.mp3 URLs
   * ================================================= */

  if (
    results.length <
    MAX_SOUND_RESULTS
  ) {
    const mp3Regex =
      /(?:https?:)?\/\/[^"'\\\s<>]+\/media\/sounds\/[^"'\\\s<>]+\.mp3(?:\?[^"'\\\s<>]*)?/gi;

    const urls =
      normalized.match(
        mp3Regex
      ) || [];

    for (
      const rawUrl
      of urls
    ) {
      const audioUrl =
        normalizeAudioUrl(
          rawUrl
        );

      if (
        !audioUrl ||
        !isMp3Url(audioUrl) ||
        seen.has(audioUrl)
      ) {
        continue;
      }

      seen.add(
        audioUrl
      );

      let title =
        'Sound';

      try {
        title =
          path.basename(
            new URL(
              audioUrl
            ).pathname,
            '.mp3'
          );
      } catch {}

      results.push({
        index:
          results.length + 1,
        name:
          cleanHtmlText(
            decodeURIComponent(
              title
            )
          ),
        url: audioUrl,
      });

      if (
        results.length >=
        MAX_SOUND_RESULTS
      ) {
        break;
      }
    }
  }

  return results;
}

/* =====================================================
 * FORMAT RESULTS
 * ===================================================== */

function formatSoundResults(
  query,
  results
) {
  let text =
    `🔊 *MyInstants Sound Search*\n\n` +
    `🔎 Query: *${query}*\n\n`;

  for (
    const sound of results
  ) {
    text +=
      `*${sound.index}.* ${sound.name}\n`;
  }

  text +=
    `\n━━━━━━━━━━━━━━━━━━\n` +
    `Reply with *1-${results.length}* to download.`;

  return text;
}

/* =====================================================
 * DOWNLOAD
 * ===================================================== */

async function downloadSound(
  sound
) {
  if (!sound?.url) {
    throw new Error(
      'INVALID_SOUND_URL'
    );
  }

  const directory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'abix-sound-'
      )
    );

  const fileName =
    `${safeFileName(
      sound.name
    )}-${randomUUID()}.mp3`;

  const filePath =
    path.join(
      directory,
      fileName
    );

  try {
    const response =
      await fetch(
        sound.url,
        {
          headers: {
            'User-Agent':
              USER_AGENT,
            Referer:
              MYINSTANTS_BASE,
            Accept:
              'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
          },
          signal:
            AbortSignal.timeout(
              REQUEST_TIMEOUT
            ),
        }
      );

    if (!response.ok) {
      throw new Error(
        `SOUND_HTTP_${response.status}`
      );
    }

    const contentLength =
      Number(
        response.headers.get(
          'content-length'
        ) || 0
      );

    if (
      contentLength >
      MAX_SOUND_BYTES
    ) {
      throw new Error(
        'SOUND_FILE_TOO_LARGE'
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    if (!buffer.length) {
      throw new Error(
        'EMPTY_SOUND_FILE'
      );
    }

    if (
      buffer.length >
      MAX_SOUND_BYTES
    ) {
      throw new Error(
        'SOUND_FILE_TOO_LARGE'
      );
    }

    await fs.writeFile(
      filePath,
      buffer
    );

    return {
      file: filePath,
      size: buffer.length,
      name: fileName,

      async cleanup() {
        await fs.rm(
          directory,
          {
            recursive: true,
            force: true,
          }
        );
      },
    };
  } catch (error) {
    await fs.rm(
      directory,
      {
        recursive: true,
        force: true,
      }
    ).catch(() => {});

    throw error;
  }
}

/* =====================================================
 * PENDING SOUND SEARCHES
 * ===================================================== */

const pendingSoundSearches =
  new Map();

const SOUND_STATE_TTL =
  5 * 60 * 1000;

function cleanupSoundStates() {
  const now =
    Date.now();

  for (
    const [
      jid,
      state,
    ]
      of pendingSoundSearches.entries()
  ) {
    if (
      !state ||
      !state.createdAt ||
      now - state.createdAt >
        SOUND_STATE_TTL
    ) {
      pendingSoundSearches.delete(
        jid
      );
    }
  }
}

/* =====================================================
 * SOUND SELECTION HELPERS
 * ===================================================== */

export function isSoundSelection(
  text
) {
  return /^(?:[1-9]|10)$/.test(
    String(text || '').trim()
  );
}

export function hasPendingSoundSearch(
  jid
) {
  cleanupSoundStates();

  const state =
    pendingSoundSearches.get(
      jid
    );

  if (!state) {
    return false;
  }

  return (
    Date.now() -
      state.createdAt <=
    SOUND_STATE_TTL
  );
}

/* =====================================================
 * NUMBER SELECTION
 * ===================================================== */

export async function handleSoundSelection({
  sock,
  jid,
  text,
}) {
  cleanupSoundStates();

  const choice =
    String(text || '').trim();

  if (
    !isSoundSelection(
      choice
    )
  ) {
    return false;
  }

  const state =
    pendingSoundSearches.get(
      jid
    );

  if (!state) {
    return false;
  }

  if (
    Date.now() -
      state.createdAt >
    SOUND_STATE_TTL
  ) {
    pendingSoundSearches.delete(
      jid
    );

    await sock.sendMessage(
      jid,
      {
        text:
          '⌛ *Sound search expired.*\n\n' +
          'Please search again.',
      }
    );

    return true;
  }

  const index =
    Number(choice) - 1;

  const sound =
    state.results?.[index];

  if (!sound) {
    await sock.sendMessage(
      jid,
      {
        text:
          `❌ Invalid selection.\n` +
          `Choose *1-${state.results.length}*.`,
      }
    );

    return true;
  }

  pendingSoundSearches.delete(
    jid
  );

  await sendSound({
    sock,
    jid,
    sound,
  });

  return true;
}

/* =====================================================
 * SEND SOUND
 * ===================================================== */

async function sendSound({
  sock,
  jid,
  sound,
}) {
  let result = null;

  try {
    await sock.sendMessage(
      jid,
      {
        text:
          `🔊 *Downloading Sound*\n` +
          `🎵 ${sound.name}\n\n` +
          `⏳ Please wait...`,
      }
    );

    result =
      await downloadSound(
        sound
      );

    const audio =
      await fs.readFile(
        result.file
      );

    if (!audio.length) {
      throw new Error(
        'EMPTY_SOUND_FILE'
      );
    }

    await sock.sendMessage(
      jid,
      {
        audio,
        mimetype:
          'audio/mpeg',
        fileName:
          `${safeFileName(
            sound.name
          )}.mp3`,
        ptt: true,
      }
    );
  } catch (error) {
    console.error(
      'MyInstants sound error:',
      error
    );

    let message =
      '❌ Failed to download the sound.';

    if (
      error?.message ===
      'INVALID_SOUND_URL'
    ) {
      message =
        '❌ Invalid sound URL.';
    }

    if (
      error?.message ===
      'EMPTY_SOUND_FILE'
    ) {
      message =
        '❌ MyInstants returned an empty audio file.';
    }

    if (
      error?.message ===
      'SOUND_FILE_TOO_LARGE'
    ) {
      message =
        '❌ This sound is larger than the allowed size.';
    }

    if (
      String(
        error?.message || ''
      ).startsWith(
        'SOUND_HTTP_'
      )
    ) {
      message =
        '❌ MyInstants rejected the audio request.';
    }

    await sock.sendMessage(
      jid,
      {
        text: message,
      }
    );
  } finally {
    if (
      result?.cleanup
    ) {
      try {
        await result.cleanup();
      } catch (cleanupError) {
        console.error(
          'MyInstants cleanup error:',
          cleanupError
        );
      }
    }
  }
}

/* =====================================================
 * SOUND COMMAND
 * ===================================================== */

export async function handleMemeSound({
  sock,
  jid,
  query,
}) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    await sock.sendMessage(
      jid,
      {
        text:
          '🔊 *MyInstants Sound Downloader*\n\n' +
          'Usage:\n' +
          '/memesound bruh\n' +
          '/sound vine boom\n' +
          '/meme sound womp\n\n' +
          'Then reply with a number.',
      }
    );

    return null;
  }

  cleanupSoundStates();

  try {
    await sock.sendMessage(
      jid,
      {
        text:
          `🔎 Searching MyInstants for:\n` +
          `*${cleanQuery}*`,
      }
    );

    const results =
      await searchMyInstants(
        cleanQuery
      );

    if (
      !Array.isArray(results) ||
      !results.length
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `❌ No MyInstants sounds found for:\n` +
            `*${cleanQuery}*`,
        }
      );

      return null;
    }

    pendingSoundSearches.set(
      jid,
      {
        query:
          cleanQuery,
        results,
        createdAt:
          Date.now(),
      }
    );

    await sock.sendMessage(
      jid,
      {
        text:
          formatSoundResults(
            cleanQuery,
            results
          ),
      }
    );

    return null;
  } catch (error) {
    console.error(
      'MyInstants search error:',
      error
    );

    let message =
      '❌ MyInstants search failed.\n' +
      'Please try another search term.';

    if (
      error?.message ===
      'EMPTY_SOUND_QUERY'
    ) {
      message =
        '❌ Please provide a sound name.';
    }

    if (
      String(
        error?.message || ''
      ).startsWith(
        'MYINSTANTS_HTTP_'
      )
    ) {
      message =
        '❌ MyInstants did not return the search page.';
    }

    await sock.sendMessage(
      jid,
      {
        text: message,
      }
    );

    return null;
  }
}

/* =====================================================
 * RANDOM SOUND
 * ===================================================== */

export async function handleRandomSound({
  sock,
  jid,
}) {
  cleanupSoundStates();

  try {
    const queries = [
      'meme',
      'funny',
      'bruh',
      'vine',
      'reaction',
      'womp',
      'laugh',
      'wow',
    ];

    let results = [];

    for (
      let attempt = 0;
      attempt <
        queries.length;
      attempt += 1
    ) {
      const query =
        queries[
          Math.floor(
            Math.random() *
            queries.length
          )
        ];

      try {
        results =
          await searchMyInstants(
            query
          );
      } catch {
        results = [];
      }

      if (
        results.length
      ) {
        break;
      }
    }

    if (
      !results.length
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '❌ Could not find a random MyInstants sound.',
        }
      );

      return null;
    }

    const sound =
      results[
        Math.floor(
          Math.random() *
          results.length
        )
      ];

    await sendSound({
      sock,
      jid,
      sound,
    });

    return null;
  } catch (error) {
    console.error(
      'Random sound error:',
      error
    );

    await sock.sendMessage(
      jid,
      {
        text:
          '❌ Random sound failed.',
      }
    );

    return null;
  }
}

/* =====================================================
 * GENERAL MEME COMMAND
 * ===================================================== */

export async function handleMeme({
  sock,
  jid,
  msg,
  arg,
}) {
  const value =
    String(arg || '').trim();

  const lower =
    value.toLowerCase();

  if (
    lower.startsWith(
      'sound '
    )
  ) {
    return handleMemeSound({
      sock,
      jid,
      query:
        value
          .slice(6)
          .trim(),
    });
  }

  if (
    lower === 'sound'
  ) {
    return handleMemeSound({
      sock,
      jid,
      query: '',
    });
  }

  await sock.sendMessage(
    jid,
    {
      text:
        value
          ? `😂 Meme search requested: *${value}*`
          : '😂 Use /memesound <name> for MyInstants sounds.',
    }
  );

  return null;
}

/* =====================================================
 * ALIAS
 * ===================================================== */

export const handleSound =
  handleMemeSound;