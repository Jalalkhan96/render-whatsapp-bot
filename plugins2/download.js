const axios = require('axios');
const path = require('path');

const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: 'ABIX-AE',
    serverMessageId: -1
  }
};

// Extensions WhatsApp can natively display/preview
const WA_SUPPORTED_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.mp3', '.mp4', '.jpg', '.jpeg', '.png',
  '.gif', '.webp', '.ogg', '.wav', '.opus', '.aac', '.m4a',
  '.3gp', '.mov', '.avi', '.mkv', '.webm'
]);

const MIME_EXTENSIONS = {
  'application/pdf': '.pdf', 'application/zip': '.zip',
  'application/vnd.android.package-archive': '.apk', 'audio/mpeg': '.mp3',
  'video/mp4': '.mp4', 'image/jpeg': '.jpg', 'image/png': '.png',
  'image/gif': '.gif', 'image/webp': '.webp', 'text/plain': '.txt'
};

function formatBytes(bytes) {
  if (!bytes) return 'Unknown';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Download a buffer from URL with progress
 */
async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  return { buffer: Buffer.from(res.data), contentType: res.headers['content-type'] || '' };
}

/**
 * Create a minimal ZIP archive in memory using pure JS (no external deps)
 * Supports one file entry, no compression (stored) for simplicity
 */
function zipBuffer(fileBuffer, fileName) {
  const nameBytes = Buffer.from(fileName, 'utf8');
  const now = new Date();
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);

  // CRC-32 calculation
  const crcTable = makeCRCTable();
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function makeCRCTable() {
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table.push(c);
    }
    return table;
  }

  const crc = crc32(fileBuffer);
  const fileSize = fileBuffer.length;

  // Local file header
  const localHeader = Buffer.alloc(30 + nameBytes.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4);          // version needed
  localHeader.writeUInt16LE(0, 6);           // general flags
  localHeader.writeUInt16LE(0, 8);           // compression: stored
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(fileSize, 18);   // compressed size
  localHeader.writeUInt32LE(fileSize, 22);   // uncompressed size
  localHeader.writeUInt16LE(nameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);          // extra field length
  nameBytes.copy(localHeader, 30);

  // Central directory header
  const centralHeader = Buffer.alloc(46 + nameBytes.length);
  centralHeader.writeUInt32LE(0x02014b50, 0); // signature
  centralHeader.writeUInt16LE(20, 4);          // version made by
  centralHeader.writeUInt16LE(20, 6);          // version needed
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(fileSize, 20);
  centralHeader.writeUInt32LE(fileSize, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);          // extra field length
  centralHeader.writeUInt16LE(0, 32);          // file comment length
  centralHeader.writeUInt16LE(0, 34);          // disk number start
  centralHeader.writeUInt16LE(0, 36);          // internal attributes
  centralHeader.writeUInt32LE(0, 38);          // external attributes
  centralHeader.writeUInt32LE(0, 42);          // relative offset of local header
  nameBytes.copy(centralHeader, 46);

  const centralOffset = localHeader.length + fileBuffer.length;
  const centralSize = centralHeader.length;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk with central dir
  eocd.writeUInt16LE(1, 8);          // num entries on disk
  eocd.writeUInt16LE(1, 10);         // total entries
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([localHeader, fileBuffer, centralHeader, eocd]);
}

module.exports = {
  command: 'download',
  aliases: ['dlfile', 'fetch'],
  category: 'utility',
  description: 'Download any direct link and send as document. Unsupported formats are auto-zipped.',
  usage: '.download <direct-file-url>',

  async handler(sock, message, args, context) {
    const chatId = context?.chatId || message.key.remoteJid;
    const url = args[0];

    if (!url || !url.startsWith('http')) {
      return await sock.sendMessage(chatId, {
        text:
          `📥 *File Downloader*\n\n` +
          `*Usage:* .dl <direct url>\n\n` +
          `*Examples:*\n` +
          `• .download https://example.com/file.pdf\n` +
          `• .download https://example.com/app.apk\n\n` +
          `> _Unsupported formats are auto-zipped!_`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    try {
      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      await sock.sendMessage(chatId, {
        text: '⬇️ *Downloading file, please wait...*\n_(Large files may take a while)_',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      // Extract filename from URL
      let fileName = 'downloaded_file';
      try {
        const parsedUrl = new URL(url);
        const baseName = path.basename(parsedUrl.pathname.split('?')[0]);
        if (baseName && baseName.includes('.')) fileName = baseName;
        else if (baseName) fileName = baseName + '.bin';
      } catch (e) {}

      // Download the buffer
      const { buffer, contentType } = await downloadBuffer(url);
      let ext = path.extname(fileName).toLowerCase();
      const detectedExt = MIME_EXTENSIONS[contentType.split(';')[0].trim().toLowerCase()];
      if ((!ext || ext === '.bin') && detectedExt) {
        fileName = fileName.replace(/\.bin$/i, '') + detectedExt;
        ext = detectedExt;
      }
      const isSupported = WA_SUPPORTED_EXTS.has(ext);
      const fileSize = formatBytes(buffer.length);

      if (isSupported) {
        // Send directly as document
        let mimetype = 'application/octet-stream';
        if (ext === '.pdf') mimetype = 'application/pdf';
        else if (ext === '.apk') mimetype = 'application/vnd.android.package-archive';
        else if (ext === '.zip') mimetype = 'application/zip';
        else if (ext === '.mp3') mimetype = 'audio/mpeg';
        else if (ext === '.mp4') mimetype = 'video/mp4';
        else if (ext === '.jpg' || ext === '.jpeg') mimetype = 'image/jpeg';
        else if (ext === '.png') mimetype = 'image/png';
        else if (contentType) mimetype = contentType.split(';')[0].trim();

        await sock.sendMessage(chatId, {
          document: buffer,
          fileName,
          mimetype,
          caption:
            `✅ *File Downloaded!*\n\n` +
            `📄 *Name:* ${fileName}\n` +
            `📦 *Size:* ${fileSize}\n` +
            `🔗 *Source:* ${url.substring(0, 60)}...`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });

      } else {
        // Unsupported extension → zip it
        await sock.sendMessage(chatId, {
          text: `⚠️ *Format \`${ext || 'unknown'}\` is not natively supported by WhatsApp.*\n_Auto-zipping the file for you..._`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });

        const archiveBuffer = zipBuffer(buffer, fileName);
        const zipName = fileName.replace(/\.[^.]+$/, '') + '.zip';

        await sock.sendMessage(chatId, {
          document: archiveBuffer,
          fileName: zipName,
          mimetype: 'application/zip',
          caption:
            `✅ *File Downloaded & Zipped!*\n\n` +
            `📄 *Original:* ${fileName}\n` +
            `🗜️ *Archive:* ${zipName}\n` +
            `📦 *Size:* ${fileSize}\n` +
            `🔗 *Source:* ${url.substring(0, 60)}...`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
      console.error('[DL] Error:', error.message);
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(chatId, {
        text: '❌ *Download Failed!*\n\nPossible reasons:\n• File is too large\n• Link is invalid or expired\n• Server timed out\n\nPlease try again.',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};
