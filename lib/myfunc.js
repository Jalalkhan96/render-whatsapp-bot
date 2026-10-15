const {
    proto,
    delay,
    getContentType
} = require('@whiskeysockets/baileys');

const RESET = '\x1b[0m';
const makeStyle = (code) => (value) => `${code}${value}${RESET}`;
const chalk = { redBright: makeStyle('\x1b[91m') };

const fs = require('fs');
const Crypto = require('crypto');
const axios = require('axios');
const moment = require('moment-timezone');
const { sizeFormatter } = require('human-readable');
const util = require('util');
const sharp = require('sharp');
const path = require('path');
const { tmpdir } = require('os');

// ── file-type is optional & lazy-loaded so a broken install doesn't
//    take down the whole process on require().
function getFileType() {
    try { return require('file-type'); }
    catch (e) {
        console.warn('[myfunc] file-type not available:', e.message);
        return null;
    }
}

const unixTimestampSeconds = (date = new Date()) => Math.floor(date.getTime() / 1000);
exports.unixTimestampSeconds = unixTimestampSeconds;

exports.generateMessageTag = (epoch) => {
    let tag = unixTimestampSeconds().toString();
    if (epoch) tag += '.--' + epoch;
    return tag;
};

exports.processTime = (timestamp, now) =>
    moment.duration(now - moment(timestamp * 1000)).asSeconds();

exports.getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;

exports.getBuffer = async (url, options) => {
    try {
        const res = await axios({
            method: 'get',
            url,
            headers: { 'DNT': 1, 'Upgrade-Insecure-Request': 1 },
            ...(options || {}),
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (err) {
        return err;
    }
};

exports.getImg = async (url, options) => {
    try {
        const res = await axios({
            method: 'get',
            url,
            headers: { 'DNT': 1, 'Upgrade-Insecure-Request': 1 },
            ...(options || {}),
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (err) {
        return err;
    }
};

exports.fetchJson = async (url, options) => {
    try {
        const res = await axios({
            method: 'GET',
            url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...(options || {})
        });
        return res.data;
    } catch (err) {
        return err;
    }
};

// ── Aliases that index.js destructures but the old file never exported:
exports.fetch = exports.getBuffer;
exports.await = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.runtime = function (seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const dDisplay = d > 0 ? d + (d === 1 ? ' day, ' : ' days, ') : '';
    const hDisplay = h > 0 ? h + (h === 1 ? ' hour, ' : ' hours, ') : '';
    const mDisplay = m > 0 ? m + (m === 1 ? ' minute, ' : ' minutes, ') : '';
    const sDisplay = s > 0 ? s + (s === 1 ? ' second' : ' seconds') : '';
    return dDisplay + hDisplay + mDisplay + sDisplay;
};

exports.clockString = (ms) => {
    const h = isNaN(ms) ? '--' : Math.floor(ms / 3600000);
    const m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60;
    const s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60;
    return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':');
};

exports.sleep = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.isUrl = (url) => {
    if (typeof url !== 'string') return null;
    return url.match(new RegExp(
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/,
        'gi'
    ));
};

exports.getTime = (format, date) => {
    if (date) return moment(date).locale('en').format(format);
    return moment.tz('Asia/Karachi').locale('en').format(format);
};

exports.formatDate = (n, locale = 'en') => {
    const d = new Date(n);
    return d.toLocaleDateString(locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
};

exports.tanggal = (numer) => {
    const myMonths = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    const myDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const tgl = new Date(numer);
    const day = tgl.getDate();
    const bulan = tgl.getMonth();
    const thisDay = myDays[tgl.getDay()];
    const yy = tgl.getYear();
    const year = (yy < 1000) ? yy + 1900 : yy;
    return `${thisDay}, ${day} - ${myMonths[bulan]} - ${year}`;
};

exports.jam = (numer, options = {}) => {
    const format = options.format ? options.format : 'HH:mm';
    if (options.timeZone) return moment(numer).tz(options.timeZone).format(format);
    return moment(numer).format(format);
};

exports.formatp = sizeFormatter({
    std: 'JEDEC',
    decimalPlaces: 2,
    keepTrailingZeroes: false,
    render: (literal, symbol) => `${literal} ${symbol}B`,
});

exports.json = (string) => JSON.stringify(string, null, 2);

exports.logic = (check, inp, out) => {
    if (inp.length !== out.length) throw new Error('Input and Output must have same length');
    for (const i in inp) if (util.isDeepStrictEqual(check, inp[i])) return out[i];
    return null;
};

exports.generateProfilePicture = async (buffer) => {
    const image = sharp(buffer);
    const resized = await image
        .resize(720, 720, { fit: 'inside', withoutEnlargement: false })
        .jpeg()
        .toBuffer();
    return { img: resized, preview: resized };
};

exports.bytesToSize = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

exports.getSizeMedia = (filePath) => new Promise((resolve, reject) => {
    if (typeof filePath === 'string' && /http/.test(filePath)) {
        axios.get(filePath)
            .then((res) => {
                const length = parseInt(res.headers['content-length']);
                const size = exports.bytesToSize(length, 3);
                if (!isNaN(length)) resolve(size);
                else reject('Invalid content-length');
            })
            .catch(reject);
    } else if (Buffer.isBuffer(filePath)) {
        const length = Buffer.byteLength(filePath);
        const size = exports.bytesToSize(length, 3);
        if (!isNaN(length)) resolve(size);
        else reject('Invalid buffer length');
    } else {
        reject('Unsupported media type');
    }
});

exports.parseMention = (text = '') =>
    [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');

exports.getGroupAdmins = (participants) => {
    const admins = [];
    for (const i of participants) {
        if (i.admin === 'superadmin' || i.admin === 'admin') admins.push(i.id);
    }
    return admins || [];
};

// ── file-type helper (safe if dep missing)
exports.getFileTypeFromBuffer = async (buf) => {
    const ft = getFileType();
    if (!ft) return null;
    try { return await ft.fromBuffer(buf); }
    catch (_) { return null; }
};

/**
 * Serialize Message
 */
exports.smsg = (QasimDev, m, store) => {
    if (!m) return m;
    const M = proto.WebMessageInfo;
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id && m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat && m.chat.endsWith('@g.us');
        m.sender = QasimDev.decodeJid(
            (m.fromMe && QasimDev.user.id) ||
            m.participant ||
            m.key.participant ||
            m.chat ||
            ''
        );
        if (m.isGroup) m.participant = QasimDev.decodeJid(m.key.participant) || '';
    }
    if (m.message) {
        m.mtype = getContentType(m.message);
        m.msg = (m.mtype === 'viewOnceMessage'
            ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)]
            : m.message[m.mtype]);

        if (!m.msg) m.msg = {};

        m.body =
            m.message.conversation ||
            m.msg.caption ||
            m.msg.text ||
            (m.mtype === 'listResponseMessage' && m.msg.singleSelectReply && m.msg.singleSelectReply.selectedRowId) ||
            (m.mtype === 'buttonsResponseMessage' && m.msg.selectedButtonId) ||
            (m.mtype === 'viewOnceMessage' && m.msg.caption) ||
            m.text;

        const quoted = m.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null;
        m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : [];

        if (m.quoted) {
            let type = getContentType(quoted);
            m.quoted = m.quoted[type];
            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted);
                m.quoted = m.quoted[type];
            }
            if (typeof m.quoted === 'string') m.quoted = { text: m.quoted };
            m.quoted.mtype = type;
            m.quoted.id = m.msg.contextInfo.stanzaId;
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat;
            m.quoted.isBaileys = m.quoted.id
                ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16
                : false;
            m.quoted.sender = QasimDev.decodeJid(m.msg.contextInfo.participant);
            m.quoted.fromMe = m.quoted.sender === (QasimDev.user && QasimDev.user.id);
            m.quoted.text =
                m.quoted.text ||
                m.quoted.caption ||
                m.quoted.conversation ||
                m.quoted.contentText ||
                m.quoted.selectedDisplayText ||
                m.quoted.title ||
                '';
            m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : [];

            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false;
                const q = await store.loadMessage(m.chat, m.quoted.id, QasimDev);
                return exports.smsg(QasimDev, q, store);
            };

            const vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    remoteJid: m.quoted.chat,
                    fromMe: m.quoted.fromMe,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            });

            m.quoted.delete = () => QasimDev.sendMessage(m.quoted.chat, { delete: vM.key });
            m.quoted.copyNForward = (jid, forceForward = false, options = {}) =>
                QasimDev.copyNForward(jid, vM, forceForward, options);
            m.quoted.download = () => QasimDev.downloadMediaMessage(m.quoted);
        }
    }
    if (m.msg && m.msg.url) m.download = () => QasimDev.downloadMediaMessage(m.msg);
    m.text =
        (m.msg && (m.msg.text || m.msg.caption || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title)) ||
        (m.message && m.message.conversation) ||
        '';

    m.reply = (text, chatId = m.chat, options = {}) =>
        Buffer.isBuffer(text)
            ? QasimDev.sendMedia(chatId, text, 'file', '', m, { ...options })
            : QasimDev.sendText(chatId, text, m, { ...options });

    m.copy = () => exports.smsg(QasimDev, M.fromObject(M.toObject(m)));

    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) =>
        QasimDev.copyNForward(jid, m, forceForward, options);

    return m;
};

exports.reSize = async (buffer, ukur1, ukur2) => {
    return sharp(buffer)
        .resize(Number(ukur1), Number(ukur2), { fit: 'fill' })
        .jpeg()
        .toBuffer();
};

// NOTE: removed the self-reloading fs.watchFile block. It caused duplicate
// listeners and side effects on every file save. Restart the process instead.