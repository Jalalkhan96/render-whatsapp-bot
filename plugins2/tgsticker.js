const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { fileTypeFromBuffer } = require('file-type')
const webp = require('node-webpmux')
const fetch = require('node-fetch')
const ffmpeg = require('fluent-ffmpeg')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const { writeExifImg } = require('../lib/exif')

const tmp = path.join(__dirname, '../tmp')

/**
 * Image to Sticker
 * @param {Buffer} img Image Buffer
 * @param {String} url Image URL
 */
function sticker2(img, url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (url) {
        let res = await fetch(url)
        if (res.status !== 200) throw await res.text()
        img = await res.buffer()
      }
      let inp = path.join(tmp, +new Date + '.jpeg')
      await fs.promises.writeFile(inp, img)
      let ff = spawn('ffmpeg', [
        '-y',
        '-i', inp,
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,setsar=1',
        '-f', 'png',
        '-'
      ])
      ff.on('error', reject)
      ff.on('close', async () => {
        await fs.promises.unlink(inp)
      })
      let bufs = []
      const [_spawnprocess, ..._spawnargs] = [...(module.exports.support.gm ? ['gm'] : module.exports.magick ? ['magick'] : []), 'convert', 'png:-', 'webp:-']
      let im = spawn(_spawnprocess, _spawnargs)
      im.on('error', e => conn.reply(m.chat, util.format(e), m))
      im.stdout.on('data', chunk => bufs.push(chunk))
      ff.stdout.pipe(im.stdin)
      im.on('exit', () => {
        resolve(Buffer.concat(bufs))
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Image/Video to Sticker
 * @param {Buffer} img Image/Video Buffer
 * @param {String} url Image/Video URL
 * @param {String} packname EXIF Packname
 * @param {String} author EXIF Author
 */
async function sticker3(img, url, packname, author) {
  url = url ? url : await uploadFile(img)
  let res = await fetch('https://api.xteam.xyz/sticker/wm?' + new URLSearchParams(Object.entries({
    url,
    packname,
    author
  })))
  return await res.buffer()
}

/**
 * Image to Sticker
 * @param {Buffer} img Image/Video Buffer
 * @param {String} url Image/Video URL
 */
async function sticker4(img, url) {
  if (url) {
    let res = await fetch(url)
    if (res.status !== 200) throw await res.text()
    img = await res.buffer()
  }
  return await ffmpeg(img, [
    '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,setsar=1'
  ], 'jpeg', 'webp')
}

/**
 * Convert using fluent-ffmpeg
 * @param {string} img 
 * @param {string} url 
 */
function sticker6(img, url) {
  return new Promise(async (resolve, reject) => {
    if (url) {
      let res = await fetch(url)
      if (res.status !== 200) throw await res.text()
      img = await res.buffer()
    }
    const type = await fileTypeFromBuffer(img) || {
      mime: 'application/octet-stream',
      ext: 'bin'
    }
    if (type.ext == 'bin') reject(img)
    const tmp = path.join(__dirname, `../tmp/${+ new Date()}.${type.ext}`)
    const out = path.join(tmp + '.webp')
    await fs.promises.writeFile(tmp, img)
    // https://github.com/MhankBarBar/termux-wabot/blob/main/index.js#L313#L368
    let Fffmpeg = /video/i.test(type.mime) ? fluent_ffmpeg(tmp).inputFormat(type.ext) : fluent_ffmpeg(tmp).input(tmp)
    Fffmpeg
      .on('error', function (err) {
        console.error(err)
        fs.promises.unlink(tmp)
        reject(img)
      })
      .on('end', async function () {
        fs.promises.unlink(tmp)
        resolve(await fs.promises.readFile(out))
      })
      .addOutputOptions([
        `-vcodec`, `libwebp`, `-vf`,
        `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`
      ])
      .toFormat('webp')
      .save(out)
  })
}

/**
 * Dependency-free fallback EXIF/RIFF chunk injector for WebP buffers.
 *
 * Used only when node-webpmux (or its internal `file-type` dependency)
 * fails to load/save the image — e.g. because an incompatible `file-type`
 * package version is installed and node-webpmux's own internal
 * `fileTypeFromBuffer` check breaks. This writes the WhatsApp sticker EXIF
 * metadata chunk by hand, directly into the WebP RIFF container, with no
 * external packages involved.
 *
 * Requires the input WebP to already be in "extended" format (i.e. it has
 * a VP8X chunk). Animated WebPs (ANIM/ANMF) and most WebPs with an alpha
 * channel already use the extended format, so this covers the common
 * failure case. Simple-format static WebPs without a VP8X chunk cannot be
 * patched this way and will throw — that's an inherent limitation of the
 * WebP container spec, not a bug in this function.
 *
 * @param {Buffer} webpBuffer Source WebP file bytes
 * @param {Buffer} exifChunkData Raw EXIF chunk payload (already built)
 * @returns {Buffer} New WebP file bytes with the EXIF chunk attached
 */
function injectExifManual(webpBuffer, exifChunkData) {
  if (
    webpBuffer.length < 12 ||
    webpBuffer.slice(0, 4).toString('ascii') !== 'RIFF' ||
    webpBuffer.slice(8, 12).toString('ascii') !== 'WEBP'
  ) {
    throw new Error('input is not a valid WebP buffer (missing RIFF/WEBP header).');
  }

  const chunks = [];
  let offset = 12;
  let vp8xIndex = -1;

  while (offset + 8 <= webpBuffer.length) {
    const fourCC = webpBuffer.slice(offset, offset + 4).toString('ascii');
    const size = webpBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const data = webpBuffer.slice(dataStart, dataStart + size);

    // Drop any pre-existing EXIF chunk — we're replacing it.
    if (fourCC === 'EXIF') {
      offset = dataStart + size + (size % 2);
      continue;
    }

    if (fourCC === 'VP8X') vp8xIndex = chunks.length;
    chunks.push({ fourCC, data });
    offset = dataStart + size + (size % 2);
  }

  if (vp8xIndex === -1) {
    throw new Error('input has no VP8X chunk (simple WebP format); cannot attach metadata without full re-mux.');
  }

  // Set the EXIF-present bit (0x08) in the VP8X flags byte (first byte of
  // its payload), per the WebP Extended File Format spec.
  const vp8xData = Buffer.from(chunks[vp8xIndex].data);
  vp8xData[0] = vp8xData[0] | 0x08;
  chunks[vp8xIndex] = { fourCC: 'VP8X', data: vp8xData };

  // EXIF chunk is appended after all existing chunks — valid per spec,
  // chunk order after VP8X is otherwise unconstrained for metadata chunks.
  chunks.push({ fourCC: 'EXIF', data: exifChunkData });

  const chunkBuffers = chunks.map(({ fourCC, data }) => {
    const padded = data.length % 2 === 0 ? data : Buffer.concat([data, Buffer.from([0])]);
    const header = Buffer.alloc(8);
    header.write(fourCC, 0, 'ascii');
    header.writeUInt32LE(data.length, 4);
    return Buffer.concat([header, padded]);
  });

  const payload = Buffer.concat(chunkBuffers);
  const riffHeader = Buffer.alloc(12);
  riffHeader.write('RIFF', 0, 'ascii');
  riffHeader.writeUInt32LE(4 + payload.length, 4); // "WEBP" + all chunks
  riffHeader.write('WEBP', 8, 'ascii');

  return Buffer.concat([riffHeader, payload]);
}

/**
 * Add WhatsApp JSON Exif Metadata
 * Taken from https://github.com/pedroslopez/whatsapp-web.js/pull/527/files
 * @param {Buffer} webpSticker 
 * @param {String} packname 
 * @param {String} author 
 * @param {String} categories 
 * @param {Object} extra 
 * @returns 
 */
async function addExif(webpSticker, packname, author, categories = [''], extra = {}) {
  const stickerPackId = crypto.randomBytes(32).toString('hex');
  const json = { 'sticker-pack-id': stickerPackId, 'sticker-pack-name': packname, 'sticker-pack-publisher': author, 'emojis': categories, ...extra };
  let exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  let exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);

  try {
    const img = new webp.Image();
    await img.load(webpSticker)
    img.exif = exif
    return await img.save(null)
  } catch (webpmuxError) {
    // node-webpmux (or its bundled file-type dependency) failed to load or
    // save the image — commonly caused by an incompatible `file-type`
    // package version being installed. Fall back to a dependency-free
    // manual RIFF/EXIF chunk injector rather than losing the sticker.
    try {
      return injectExifManual(webpSticker, exif);
    } catch (manualError) {
      throw new Error(
        `addExif failed — node-webpmux: ${webpmuxError.message}; manual fallback: ${manualError.message}`
      );
    }
  }
}

/**
 * Convert media to WebP and add metadata
 * @param {Buffer} inputBuffer Image Buffer
 * @param {String} url Image URL
 * @param {String} packname EXIF Packname
 * @param {String} author EXIF Author
 */
async function sticker(isImage, url, packname, author) {
    try {
        const response = await fetch(url);
        const buffer = await response.buffer();
        
        // Create sticker with metadata
        const stickerBuffer = await writeExifImg(buffer, {
            packname: packname || 'WhatsApp Bot',
            author: author || '@bot'
        });
        
        return stickerBuffer;
    } catch (error) {
        console.error('Error in sticker creation:', error);
        return null;
    }
}

const support = {
  ffmpeg: true,
  ffprobe: true,
  ffmpegWebp: true,
  convert: true,
  magick: false,
  gm: false,
  find: false
}


/**
 * Convert GIF/video buffers into a real animated WebP sticker.
 * This extends the existing sticker utility instead of creating a second
 * sticker engine. The source duration is preserved up to WhatsApp's
 * practical animated-sticker limit; frames are only reduced when the
 * resulting WebP is too large.
 */
async function animatedWebpFromBuffer(inputBuffer, options = {}) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error('Animated sticker input is empty.');
  }

  const maxDuration = Math.max(1, Math.min(6, Number(options.maxDuration) || 6));
  const token = `${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const inputPath = path.join(tmp, `animated_${token}.input`);
  const gifPath = path.join(tmp, `animated_${token}.gif`);

  await fs.promises.mkdir(tmp, { recursive: true });
  await fs.promises.writeFile(inputPath, inputBuffer);

  const cleanup = async (...files) => {
    for (const file of files.flat()) {
      try { await fs.promises.unlink(file); } catch {}
    }
  };

  try {
    const detected = await fileTypeFromBuffer(inputBuffer).catch(() => null);
    const mime = String(detected?.mime || '').toLowerCase();

    let animatedSource = inputBuffer;

    // Sharp/libwebp is used for the final animated WebP encoding. This avoids
    // the inconsistent animated-WebP muxing found in some FFmpeg builds.
    // Video/GIF input is first normalized to a short GIF only when necessary.
    if (mime.startsWith('video/') || mime === 'application/octet-stream' && /mp4|mkv|mov|avi/i.test(detected?.ext || '')) {
      await execFileAsync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inputPath,
        '-an',
        '-t', String(maxDuration),
        '-vf', 'fps=12,scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1',
        '-gifflags', '-offsetting',
        '-f', 'gif',
        gifPath
      ], { maxBuffer: 8 * 1024 * 1024 });
      animatedSource = await fs.promises.readFile(gifPath);
    }

    const image = sharp(animatedSource, { animated: true, pages: -1 });
    const meta = await image.metadata();
    const pages = Number(meta.pages || 1);
    if (pages < 2) {
      throw new Error('Source contains fewer than 2 animation frames.');
    }

    const result = await image
      .resize({
        width: 480,
        height: 480,
        fit: 'inside'
      })
      .webp({
        quality: 48,
        effort: 4,
        loop: 0,
        smartSubsample: true
      })
      .toBuffer();

    if (!result.length) throw new Error('Animated WebP output is empty.');
    if (result.length > 950 * 1024) {
      const smaller = await sharp(animatedSource, { animated: true, pages: -1 })
        .resize({ width: 360, height: 360, fit: 'inside' })
        .webp({ quality: 34, effort: 3, loop: 0, smartSubsample: true })
        .toBuffer();

      if (smaller.length < result.length) {
        return smaller;
      }
    }

    // Re-open the result to verify that WebP animation metadata survived encoding.
    const validation = await sharp(result, { animated: true }).metadata();
    const outputPages = Number(validation.pages || 1);
    if (outputPages < 2 || !validation.pageHeight) {
      throw new Error(`Animated WebP validation failed (${outputPages} frames).`);
    }

    return result;
  } finally {
    await cleanup(inputPath, gifPath);
  }
}
const execFileAsync = promisify(require('child_process').execFile);

module.exports = {
  sticker,
  sticker2,
  sticker3,
  sticker4,
  sticker6,
  animatedWebpFromBuffer,
  addExif,
  support
}