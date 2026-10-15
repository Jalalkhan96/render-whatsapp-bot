'use strict';
/**
 * TrackMatcher — verifies a candidate is the RIGHT recording, never assumes
 * the first search result is correct. Checks title, artist, album, version,
 * duration, release year and ISRC, and returns a confidence + reasons.
 */
const { normalize, splitVersion, normalizeTrack, VERSION_TAGS } = require('./query-normalizer');

function levenshtein(a, b) {
  a = a || ''; b = b || '';
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur0 = i;
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, cur0 + 1, prevDiag + cost);
      prevDiag = tmp;
      cur0 = prev[j];
    }
  }
  return prev[b.length];
}

/** 0..1 similarity between two strings (diacritic-insensitive). */
function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const longer = Math.max(x.length, y.length);
    const shorter = Math.min(x.length, y.length);
    return 0.75 + 0.25 * (shorter / longer);
  }
  const dist = levenshtein(x, y);
  const maxLen = Math.max(x.length, y.length);
  return Math.max(0, 1 - dist / maxLen);
}

function versionsConflict(qVersions, cVersions) {
  // If the query names a version tag, the candidate must carry a compatible one.
  if (!qVersions.length) return false;
  return !qVersions.some((qv) => cVersions.some((cv) => cv.includes(qv) || qv.includes(cv)));
}

/** Is this string a version tag (remix, live, acoustic, sped up, ...)? */
function isVersionTag(s) {
  const n = normalize(s);
  const compact = n.replace(/\s+/g, '');
  return VERSION_TAGS.some((t) => {
    const tn = normalize(t);
    return n === tn || compact === tn.replace(/\s+/g, '');
  });
}

/**
 * Interpretations of a free-text query: whole-as-title plus splits where the
 * last 1-3 words are treated as the artist. A split whose "artist" part is a
 * version tag (e.g. "Blinding Lights remix") also yields a versionized title
 * interpretation so the version logic can engage.
 */
function splitInterpretations(raw) {
  const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
  const out = [{ title: raw, artist: '' }];
  for (let n = 1; n <= Math.min(3, words.length - 1); n++) {
    const artist = words.slice(-n).join(' ');
    const title = words.slice(0, -n).join(' ');
    out.push({ title, artist });
    if (isVersionTag(artist)) out.push({ title: title + ' (' + artist + ')', artist: '' });
  }
  return out;
}

/** Token-based phrase containment ("the weeknd" in "blinding lights the weeknd"). */
function phraseInTokens(phrase, text) {
  const pt = normalize(phrase).split(/\s+/).filter(Boolean);
  if (!pt.length) return false;
  const tt = new Set(normalize(text).split(/\s+/).filter(Boolean));
  return pt.every((t) => tt.has(t));
}

function scoreInterp(qTitle, qArtist, c, qIsrc, classified, stuffed) {
  const reasons = [];
  let score = 0;
  let wsum = 0;
  const add = (w, v, reason) => {
    wsum += w;
    score += w * v;
    if (reason && v >= 0.6) reasons.push(reason);
  };

  const qv = splitVersion(qTitle || '');
  const qBase = normalize(qv.base);

  // artist similarity first — needed for the extra-token waiver below
  let aSim = 0;
  if (qArtist) {
    aSim = Math.max(similarity(qArtist, c.artistNorm), ...c.artistsNorm.map((a) => similarity(qArtist, a)));
  }

  // version conflict: query names a version the candidate doesn't carry
  if (qv.versions.length && versionsConflict(qv.versions, c.versions)) {
    return { confidence: 0.2, match: false, reasons: ['version mismatch: query wants "' + qv.versions.join(', ') + '"'] };
  }

  // title (on version-stripped base)
  if (qBase) {
    let tSim = similarity(qBase, c.titleNorm);
    // extra-token penalty: candidate title carries words beyond the query title
    // (keyword-stuffed spam). Waived when the artist field confirms the match.
    const qt = new Set(qBase.split(' ').filter(Boolean));
    const ct = (c.titleNorm || '').split(' ').filter(Boolean);
    if (ct.length > qt.size && ct.some((t) => !qt.has(t)) && aSim < 0.8) tSim *= 0.7;
    add(0.35, tSim, tSim >= 0.85 ? 'title matched' : tSim >= 0.6 ? 'title similar' : null);
    if (qv.versions.length && qv.versions.some((v) => c.versions.includes(v))) {
      reasons.push('version matched (' + qv.versions.join(', ') + ')');
    }
  }

  // artist
  if (qArtist) {
    add(0.30, aSim, aSim >= 0.85 ? 'artist matched' : aSim >= 0.6 ? 'artist similar' : null);
  } else if (c.artistNorm) {
    const qNorm = normalize(qTitle || '');
    if (qNorm.includes(c.artistNorm) && c.artistNorm.length > 2) {
      add(0.15, 0.9, 'artist matched (in query text)');
    }
  }

  // ISRC: strongest single signal
  if (qIsrc) {
    if (c.isrc && c.isrc === String(qIsrc).toUpperCase()) add(0.30, 1, 'ISRC matched');
    else { add(0.30, 0, null); reasons.push('ISRC not confirmed'); }
  }

  if (classified.album && c.albumNorm) {
    const s = similarity(classified.album, c.albumNorm);
    add(0.10, s, s >= 0.8 ? 'album matched' : null);
  }
  if (classified.durationMs && c.durationMs) {
    const diff = Math.abs(classified.durationMs - c.durationMs);
    const d = diff <= 4000 ? 1 - diff / 8000 : 0;
    add(0.05, d, d >= 0.9 ? 'duration matched' : null);
  }
  if (classified.year && c.year) {
    add(0.05, Math.abs(classified.year - c.year) <= 1 ? 1 : 0, null);
  }

  let confidence = wsum > 0 ? score / wsum : 0;
  // keyword-stuffing: query's artist words appear in the candidate TITLE but the
  // candidate credits someone else — classic spam/copyright-infringer pattern.
  if (stuffed) {
    confidence *= 0.35;
    reasons.push('keyword-stuffing suspected');
  }
  confidence = Math.round(confidence * 100) / 100;
  return { confidence, match: confidence >= 0.70 && reasons.length > 0, reasons };
}

/**
 * Score one candidate against the classified query.
 * Free-text queries are tried under every title/artist interpretation and the
 * best interpretation wins. Never trusts result order.
 * Returns { confidence (0..1), match (bool), reasons: [] }
 */
function scoreCandidate(classified, candidate) {
  const c = normalizeTrack(candidate);
  const qIsrc = classified.isrc || classified.isrcHint || null;

  // ISRC query: the ISRC either matches or it doesn't — no fuzzy title logic.
  if (classified.kind === 'isrc' && qIsrc) {
    if (c.isrc && c.isrc === String(qIsrc).toUpperCase()) {
      return { confidence: 0.99, match: true, reasons: ['ISRC matched'] };
    }
    return { confidence: 0, match: false, reasons: ['ISRC not confirmed'] };
  }

  // suspected multi-word artist phrases for keyword-stuffing detection.
  // Phrases containing version tags ("Lights remix") are title fragments, not artists.
  let suspected = [];
  if (classified.kind === 'text' && !classified.title) {
    for (const it of splitInterpretations(classified.raw || '')) {
      const a = (it.artist || '').trim();
      if (a.split(/\s+/).length < 2) continue;
      const an = normalize(a);
      if (VERSION_TAGS.some((t) => an.includes(normalize(t)))) continue;
      suspected.push(a);
    }
  }
  const stuffed = suspected.some((ph) =>
    phraseInTokens(ph, candidate.title || '') &&
    !phraseInTokens(ph, candidate.artist || '') &&
    !phraseInTokens(ph, (candidate.artists || []).join(' '))
  );

  let interps;
  if (classified.title || classified.kind === 'title-artist') {
    interps = [{ title: classified.title || classified.raw || '', artist: classified.artist || '' }];
  } else if (classified.kind === 'text') {
    interps = splitInterpretations(classified.raw || '');
  } else {
    interps = [{ title: classified.title || classified.raw || '', artist: classified.artist || '' }];
  }

  let best = { confidence: 0, match: false, reasons: [] };
  for (const it of interps) {
    const s = scoreInterp(it.title, it.artist, c, qIsrc, classified, stuffed);
    if (s.confidence > best.confidence) best = s;
  }
  return best;
}

/** Pick the best candidate; never trusts result order.
 * Tie-break: prefer the recording with fewer version tags (canonical over remix). */
function bestMatch(classified, candidates) {
  const scored = (candidates || []).map((cand) => {
    const s = scoreCandidate(classified, cand);
    return { candidate: cand, confidence: s.confidence, match: s.match, reasons: s.reasons };
  }).sort((a, b) =>
    (b.confidence - a.confidence) ||
    (splitVersion(a.candidate.title || '').versions.length - splitVersion(b.candidate.title || '').versions.length)
  );
  let best = null;
  if (scored.length && scored[0].confidence >= 0.5) best = scored[0];
  return { best, ranked: scored };
}

module.exports = { levenshtein, similarity, versionsConflict, scoreCandidate, bestMatch };
