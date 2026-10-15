'use strict';
/**
 * Result ranking — additive point scheme from the spec:
 *   exact title match  +25
 *   exact artist match +25
 *   ISRC match         +30
 *   album match        +10
 *   duration match     +5
 *   provider agreement +5
 * confidence >= 0.90 strong | 0.70-0.89 probable | < 0.70 uncertain
 */
const { normalize } = require('./query-normalizer');
const { similarity } = require('./track-matcher');

const POINTS = { title: 25, artist: 25, isrc: 30, album: 10, duration: 5, agreement: 5 };
const MAX_POINTS = POINTS.title + POINTS.artist + POINTS.isrc + POINTS.album + POINTS.duration + POINTS.agreement;

function rankResult(classified, candidate, providerAgreementCount = 0) {
  let pts = 0;
  const detail = [];
  const qTitle = (classified.title || classified.raw || '').trim();
  const qArtist = (classified.artist || '').trim();

  if (qTitle && normalize(qTitle) === normalize(candidate.title || '')) {
    pts += POINTS.title; detail.push('exact title +25');
  } else if (qTitle && similarity(qTitle, candidate.title || '') >= 0.85) {
    pts += 15; detail.push('close title +15');
  }
  if (qArtist && normalize(qArtist) === normalize(candidate.artist || '')) {
    pts += POINTS.artist; detail.push('exact artist +25');
  } else if (qArtist && similarity(qArtist, candidate.artist || '') >= 0.85) {
    pts += 15; detail.push('close artist +15');
  }
  const qIsrc = (classified.isrc || classified.isrcHint || '').toUpperCase();
  if (qIsrc && candidate.isrc && String(candidate.isrc).toUpperCase() === qIsrc) {
    pts += POINTS.isrc; detail.push('ISRC +30');
  }
  if (classified.album && candidate.album && normalize(classified.album) === normalize(candidate.album)) {
    pts += POINTS.album; detail.push('album +10');
  }
  if (classified.durationMs && candidate.durationMs && Math.abs(classified.durationMs - candidate.durationMs) <= 3000) {
    pts += POINTS.duration; detail.push('duration +5');
  }
  if (providerAgreementCount >= 2) { pts += POINTS.agreement; detail.push('provider agreement +5'); }

  const confidence = Math.round((pts / MAX_POINTS) * 100) / 100;
  const band = confidence >= 0.9 ? 'strong' : confidence >= 0.7 ? 'probable' : 'uncertain';
  return { points: pts, maxPoints: MAX_POINTS, confidence, band, detail };
}

module.exports = { rankResult, POINTS, MAX_POINTS };
