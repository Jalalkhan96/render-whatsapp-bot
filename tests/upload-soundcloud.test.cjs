'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
const axiosStub = {
  create: () => ({ get: async () => { throw new Error('network disabled in test'); } }),
  get: async () => { throw new Error('network disabled in test'); },
};

(async () => {
  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'axios') return axiosStub;
      if (request === '@whiskeysockets/baileys') return { downloadContentFromMessage: async function* () {} };
      return originalLoad.call(this, request, parent, isMain);
    };

    const soundcloud = require('../soundcloud.cjs');
    assert.equal(typeof soundcloud.getAuth, 'function');
    assert.equal(typeof soundcloud.collectTracks, 'function');
    assert.equal(typeof soundcloud.downloadTracks, 'function');
    assert.equal(typeof soundcloud.flatTrack, 'function');

    const flattened = soundcloud.flatTrack({
      id: 42, title: 'Neon', user: { username: 'ABIX' }, duration: 123000,
      downloadable: true, download_url: 'https://api-v2.soundcloud.com/tracks/42/download',
    });
    assert.equal(flattened.title, 'Neon');
    assert.equal(flattened.downloadable, true);
    assert.equal(flattened.download_url, 'https://api-v2.soundcloud.com/tracks/42/download');

    const pluginList = require('../plugins2/soundcloud-download.js');
    const names = new Set(pluginList.map(plugin => plugin.command));
    for (const name of ['scmusic', 'scsearch', 'scdownload', 'scplaylist', 'scuser', 'sclikes']) {
      assert.ok(names.has(name), `missing WhatsApp command ${name}`);
    }

    const telegramSource = fs.readFileSync(path.join(__dirname, '../lib/telegramBot.js'), 'utf8');
    for (const name of ['scmusic', 'scsearch', 'scdownload', 'scplaylist', 'scuser', 'sclikes']) {
      assert.ok(telegramSource.includes(name), `missing Telegram command ${name}`);
    }
    assert.doesNotMatch(telegramSource, /dropboxup|dropboxUpload|DROPBOX_/i);
    assert.doesNotMatch(telegramSource, /SOUNDCLOUD_OAUTH_TOKEN|SOUNDCLOUD_MAX_ITEMS/);

    const envExample = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    assert.doesNotMatch(envExample, /DROPBOX_|SOUNDCLOUD_/);

    const serviceSource = fs.readFileSync(path.join(__dirname, '../soundcloud.cjs'), 'utf8');
    assert.doesNotMatch(serviceSource, /SOUNDCLOUD_OAUTH_TOKEN|SOUNDCLOUD_MAX_TRACK_MB|--oauth/);
    assert.match(serviceSource, /Never use stream\/HLS URLs|No stream\/HLS ripping is performed/);

    console.log('[TEST] SoundCloud commands + no-credential config checks passed');
  } finally {
    Module._load = originalLoad;
  }
})().catch(error => {
  console.error('[TEST] SoundCloud check failed:', error.stack || error);
  process.exitCode = 1;
});
