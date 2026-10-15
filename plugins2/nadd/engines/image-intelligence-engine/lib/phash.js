'use strict';
/**
 * Perceptual hashing (dHash) over a supplied RGBA pixel buffer.
 * Pixel DECODING is pluggable / external: the engine does not bundle an
 * image decoder (zero-dep). Pass {data: Uint8Array|Buffer RGBA, width, height}.
 * By default the engine dedupes on URL/title keys and uses pHash only when
 * pixel buffers are supplied (e.g. from a host app that decodes thumbnails).
 */

function dHash(pixels, width, height) {
  if (!pixels || !width || !height) throw new Error('dHash needs pixels, width, height');
  const W = 9, H = 8;
  const gray = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(width - 1, Math.floor((x * (width - 1)) / (W - 1)));
      const sy = Math.min(height - 1, Math.floor((y * (height - 1)) / (H - 1)));
      const i = (sy * width + sx) * 4;
      gray[y * W + x] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
  }
  let bits = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      bits += gray[y * W + x] > gray[y * W + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

function hammingDistance(a, b) {
  const x = String(a || ''), y = String(b || '');
  let d = Math.abs(x.length - y.length) * 4;
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    let v = parseInt(x[i], 16) ^ parseInt(y[i], 16);
    while (v) { d += v & 1; v >>= 1; }
  }
  return d;
}

module.exports = { dHash, hammingDistance };
