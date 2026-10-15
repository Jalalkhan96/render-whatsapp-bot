var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });

const axios = require('axios');
const cheerio = require('cheerio');
const util = require('util');
const BodyForm = require('form-data');
const fs = require('fs');
const child_process = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const { unlink } = require('fs').promises;

// Lazy file-type – will not crash the process if the dep is broken.
function getFileType() {
    try { return require('file-type'); }
    catch (e) {
        console.warn('[myfunc2] file-type not available:', e.message);
        return null;
    }
}

exports.sleep = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

exports.fetchBuffer = async (url, options) => {
    try {
        const res = await axios({
            method: 'GET',
            url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.70 Safari/537.36',
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...(options || {}),
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (err) {
        return err;
    }
};

exports.fetchUrl = async (url, options) => {
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

exports.webp2mp4File = async (filePath) => new Promise((resolve, reject) => {
    const form = new BodyForm();
    form.append('new-image-url', '');
    form.append('new-image', fs.createReadStream(filePath));
    axios({
        method: 'post',
        url: 'https://s6.ezgif.com/webp-to-mp4',
        data: form,
        headers: form.getHeaders()
    }).then(({ data }) => {
        const bodyFormThen = new BodyForm();
        const $ = cheerio.load(data);
        const file = $('input[name="file"]').attr('value');
        if (!file) return reject(new Error('Could not find upload token from ezgif'));
        bodyFormThen.append('file', file);
        bodyFormThen.append('convert', 'Convert WebP to MP4!');
        axios({
            method: 'post',
            url: 'https://ezgif.com/webp-to-mp4/' + file,
            data: bodyFormThen,
            headers: bodyFormThen.getHeaders()
        }).then(({ data }) => {
            const $2 = cheerio.load(data);
            const result = 'https:' + $2('div#output > p.outfile > video > source').attr('src');
            resolve({ status: true, message: 'Created By Eternity', result });
        }).catch(reject);
    }).catch(reject);
});

exports.WAVersion = async () => {
    const get = await exports.fetchUrl('https://web.whatsapp.com/check-update?version=1&platform=web');
    return [get.currentVersion.replace(/[.]/g, ', ')];
};

exports.getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;

exports.isUrl = (url) => {
    if (typeof url !== 'string') return null;
    return url.match(new RegExp(
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/,
        'gi'
    ));
};

exports.isNumber = (number) => {
    const int = parseInt(number);
    return typeof int === 'number' && !isNaN(int);
};

exports.TelegraPh = (filePath) => new Promise(async (resolve, reject) => {
    if (!fs.existsSync(filePath)) return reject(new Error('File not Found'));
    try {
        const form = new BodyForm();
        form.append('file', fs.createReadStream(filePath));
        const data = await axios({
            url: 'https://telegra.ph/upload',
            method: 'POST',
            headers: form.getHeaders(),
            data: form
        });
        return resolve('https://telegra.ph' + data.data[0].src);
    } catch (err) {
        return reject(new Error(String(err)));
    }
});

// file-type helper (safe)
exports.getFileTypeFromBuffer = async (buf) => {
    const ft = getFileType();
    if (!ft) return null;
    try { return await ft.fromBuffer(buf); }
    catch (_) { return null; }
};

// buffergif – now writes to a directory that we create on demand
// instead of assuming ./XeonMedia/trash/ exists.
exports.buffergif = async (image) => {
    const baseDir = './temp';
    fs.mkdirSync(baseDir, { recursive: true });
    const filename = `${Math.random().toString(36).slice(2)}`;
    const gifPath = `${baseDir}/${filename}.gif`;
    const mp4Path = `${baseDir}/${filename}.mp4`;

    fs.writeFileSync(gifPath, image);

    await new Promise((resolve, reject) => {
        ffmpeg(gifPath)
            .outputOptions(['-movflags faststart', '-pix_fmt yuv420p', '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2'])
            .save(mp4Path)
            .on('end', resolve)
            .on('error', reject);
    });

    const buffer5 = await fs.promises.readFile(mp4Path);
    await Promise.all([
        unlink(mp4Path).catch(() => {}),
        unlink(gifPath).catch(() => {})
    ]);
    return buffer5;
};