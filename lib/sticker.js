const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const fileTypeApi = require('file-type')
const fileTypeFromBuffer = fileTypeApi.fileTypeFromBuffer || fileTypeApi.fromBuffer
const sharp = require('sharp')
const webp = require('node-webpmux')
const fetch = require('node-fetch')
const ffmpeg = require('fluent-ffmpeg')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const { requireFfmpegPath } = require('./ffmpegPath')
function ffmpegBinary() { return requireFfmpegPath() }
const { writeExifImg } = require('./exif')

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
      let ff = spawn(ffmpegBinary(), [
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
  const img = new webp.Image();
  const stickerPackId = crypto.randomBytes(32).toString('hex');
  const json = { 'sticker-pack-id': stickerPackId, 'sticker-pack-name': packname, 'sticker-pack-publisher': author, 'emojis': categories, ...extra };
  let exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  let exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  await img.load(webpSticker)
  img.exif = exif
  return await img.save(null)
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

  const parsedDuration = Number(options.maxDuration);
  const maxDuration = Math.max(1, Math.min(6, Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 6));
  const requestedMaxBytes = Number(options.maxBytes);
  // WhatsApp animated stickers should stay compact. Never emit an over-limit
  // animation and hope that the client accepts it.
  const maxBytes = Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
    ? Math.min(500 * 1024, Math.max(128 * 1024, requestedMaxBytes))
    : 500 * 1024;

  // No square padding or cropping: resize INSIDE the target box so the source
  // ratio is preserved and no black bars are introduced by our converter.
  const fitMode = 'inside';
  const token = `${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const detected = await fileTypeFromBuffer(inputBuffer).catch(() => null);
  const sourceExt = /^[a-z0-9]{1,8}$/i.test(String(detected?.ext || '')) ? detected.ext : 'input';
  const inputPath = path.join(tmp, `animated_${token}.${sourceExt}`);
  const gifPath = path.join(tmp, `animated_${token}.gif`);

  await fs.promises.mkdir(tmp, { recursive: true });
  await fs.promises.writeFile(inputPath, inputBuffer);

  const cleanup = async (...files) => {
    for (const file of files.flat()) {
      try { await fs.promises.unlink(file); } catch {}
    }
  };

  try {
    const mime = String(detected?.mime || '').toLowerCase();
    let animatedSource = inputBuffer;

    // Normalize videos and GIFs before encoding. This caps the duration and
    // frame rate, drops audio, and limits dimensions before consuming memory.
    // scale=decrease never crops; there is no pad filter, so no black bars.
    const isVideo = mime.startsWith('video/') ||
      (mime === 'application/octet-stream' && /^(mp4|mkv|mov|avi|webm)$/i.test(String(detected?.ext || '')));
    const isGif = mime === 'image/gif';

    if (isVideo || isGif) {
      const filter = [
        'fps=10',
        'scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos',
        'setsar=1',
        'split[a][b]',
        '[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p]',
        '[b][p]paletteuse',
      ].join(',').replace(',[a]palettegen', ';[a]palettegen').replace(',[b][p]paletteuse', ';[b][p]paletteuse');

      await execFileAsync(ffmpegBinary(), [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inputPath,
        '-an',
        '-t', String(maxDuration),
        '-filter_complex', filter,
        '-gifflags', '-offsetting',
        '-loop', '0',
        '-f', 'gif',
        gifPath,
      ], { maxBuffer: 8 * 1024 * 1024, timeout: 90000 });
      animatedSource = await fs.promises.readFile(gifPath);
    }

    const meta = await sharp(animatedSource, { animated: true, pages: -1 }).metadata();
    const pages = Number(meta.pages || 1);
    if (pages < 2) {
      throw new Error('This video/GIF has fewer than 2 usable frames. Try another short clip.');
    }

    // Try progressively smaller encodings. Keep the source ratio and animation,
    // but fit under WhatsApp's practical 500 KiB animated sticker budget.
    const attempts = [
      { size: 480, quality: 48, effort: 5 },
      { size: 420, quality: 42, effort: 5 },
      { size: 360, quality: 36, effort: 5 },
      { size: 320, quality: 31, effort: 5 },
      { size: 280, quality: 26, effort: 5 },
      { size: 240, quality: 22, effort: 6 },
    ];

    let smallest = null;
    for (const attempt of attempts) {
      const result = await sharp(animatedSource, { animated: true, pages: -1 })
        .resize({ width: attempt.size, height: attempt.size, fit: fitMode })
        .webp({
          quality: attempt.quality,
          effort: attempt.effort,
          loop: 0,
          smartSubsample: true,
        })
        .toBuffer();

      if (!result.length) continue;
      if (!smallest || result.length < smallest.length) smallest = result;
      if (result.length > maxBytes) continue;

      const validation = await sharp(result, { animated: true }).metadata();
      if (Number(validation.pages || 1) < 2 || !validation.pageHeight) {
        throw new Error('Animated WebP validation failed; try another video/GIF.');
      }
      return result;
    }

    if (smallest) {
      throw new Error(`This animation is still too large (${Math.ceil(smallest.length / 1024)} KB). Try a shorter or simpler clip.`);
    }
    throw new Error('Could not encode this animation as WebP. Try another video/GIF.');
  } finally {
    await cleanup(inputPath, gifPath);
  }
}

// Backwards-compatible alias used by legacy sticker search/convert plugins.
async function animatedMediaToWebp(inputBuffer, options = {}) {
  return animatedWebpFromBuffer(inputBuffer, {
    ...options,
    // Legacy callers may pass 'contain'; all animated sticker conversions now
    // preserve the full frame and never crop or pad by default.
    fit: 'inside',
  });
}

async function addStickerExifBuffer(webpSticker, packname, author, categories = ['']) {
  return addExif(webpSticker, packname || 'ABIX-AE', author || 'Bot', categories);
}

module.exports = {
  sticker,
  sticker2,
  sticker3,
  sticker4,
  sticker6,
  animatedWebpFromBuffer,
  animatedMediaToWebp,
  addStickerExifBuffer,
  addExif,
  support
}