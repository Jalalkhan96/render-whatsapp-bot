const SEARCH_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 5;

function cleanText(value) {
  return String(value || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .trim();
}

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1);
    }

    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

export async function searchYouTube(query, options = {}) {
  const cleanQuery = String(query || '').trim();

  if (!cleanQuery) {
    throw new Error('EMPTY_QUERY');
  }

  const maxResults = Math.min(
    Math.max(Number(options.maxResults) || MAX_RESULTS, 1),
    10
  );

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, Number(options.timeoutMs) || SEARCH_TIMEOUT_MS);

  try {
    const searchUrl =
      `https://www.youtube.com/results?search_query=` +
      encodeURIComponent(cleanQuery);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `YOUTUBE_SEARCH_HTTP_${response.status}`
      );
    }

    const html = await response.text();

    const results = [];
    const seen = new Set();

    /*
     * YouTube embeds search results in ytInitialData.
     * Extract videoId/title pairs from that response.
     */

    const videoIdRegex =
      /"videoId":"([a-zA-Z0-9_-]{11})"/g;

    let match;

    while (
      (match = videoIdRegex.exec(html)) !== null &&
      results.length < maxResults
    ) {
      const videoId = match[1];

      if (seen.has(videoId)) {
        continue;
      }

      seen.add(videoId);

      const start = Math.max(
        0,
        match.index - 1500
      );

      const end = Math.min(
        html.length,
        match.index + 3000
      );

      const block = html.slice(start, end);

      let title = null;

      const titlePatterns = [
        /"title":{"runs":\[{"text":"([^"]+)"/,
        /"title":{"simpleText":"([^"]+)"/,
      ];

      for (const pattern of titlePatterns) {
        const titleMatch = block.match(pattern);

        if (titleMatch) {
          title = cleanText(titleMatch[1]);
          break;
        }
      }

      if (!title) {
        title = `YouTube video ${results.length + 1}`;
      }

      let duration = 'Unknown';

      const durationMatch = block.match(
        /"lengthText":{"simpleText":"([^"]+)"/
      );

      if (durationMatch) {
        duration = cleanText(
          durationMatch[1]
        );
      }

      let author = 'Unknown';

      const authorPatterns = [
        /"ownerText":{"runs":\[{"text":"([^"]+)"/,
        /"longBylineText":{"runs":\[{"text":"([^"]+)"/,
      ];

      for (const pattern of authorPatterns) {
        const authorMatch =
          block.match(pattern);

        if (authorMatch) {
          author = cleanText(
            authorMatch[1]
          );
          break;
        }
      }

      const url =
        `https://www.youtube.com/watch?v=${videoId}`;

      results.push({
        number: results.length + 1,
        title,
        url,
        videoId,
        duration,
        seconds: 0,
        views: 0,
        author,
        thumbnail:
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        description: '',
      });
    }

    if (!results.length) {
      throw new Error('YOUTUBE_NO_RESULTS');
    }

    return results;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('YOUTUBE_SEARCH_TIMEOUT');
    }

    if (
      error?.message === 'YOUTUBE_NO_RESULTS'
    ) {
      throw error;
    }

    console.error(
      'YouTube search error:',
      error
    );

    throw new Error('YOUTUBE_SEARCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

export function formatYouTubeResults(
  query,
  results
) {
  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return (
      `❌ No YouTube results found for:\n` +
      `"${query}"`
    );
  }

  let text =
    `🔎 *YouTube Search*\n` +
    `Query: *${query}*\n\n`;

  for (const result of results) {
    text +=
      `*${result.number}.* ` +
      `${result.title}\n`;

    text +=
      `⏱ ${result.duration || 'Unknown'}`;

    if (result.author) {
      text +=
        `  •  👤 ${result.author}`;
    }

    text += '\n';

    text +=
      `🔗 ${result.url}\n\n`;
  }

  text +=
    `━━━━━━━━━━━━━━\n` +
    `Reply with *1-${results.length}* to download.`;

  return text;
}

export function extractYouTubeUrl(text) {
  const value = String(text || '').trim();

  if (!value) {
    return null;
  }

  const match = value.match(
    /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s]+|youtu\.be\/[^\s]+)/i
  );

  return match
    ? match[0]
    : null;
}

export function isYouTubeUrl(value) {
  try {
    const url = new URL(
      String(value).trim()
    );

    const hostname =
      url.hostname.toLowerCase();

    return (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtu.be' ||
      hostname === 'www.youtu.be'
    );
  } catch {
    return false;
  }
}

export function getYouTubeVideoId(url) {
  return extractYouTubeId(url);
}