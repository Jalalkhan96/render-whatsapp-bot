'use strict';

// Environment loading is handled by the built-in loader in ./lib/env.
// This keeps startup independent of the optional dotenv package.
require('./lib/env').loadEnv();

global.SESSION_ID = process.env.SESSION_ID || "";
global.PAIRING_NUMBER = process.env.PAIRING_NUMBER || "";

global.APIs = {
    xteam: 'https://api.xteam.xyz',
    dzx: 'https://api.dhamzxploit.my.id',
    lol: 'https://api.lolhuman.xyz',
    violetics: 'https://violetics.pw',
    neoxr: 'https://api.neoxr.my.id',
    zenzapis: 'https://zenzapis.xyz',
    akuari: 'https://api.akuari.my.id',
    akuari2: 'https://apimu.my.id',
    nrtm: 'https://fg-nrtm.ddns.net',
    bg: 'http://bochil.ddns.net',
    fgmods: 'https://api-fgmods.ddns.net'
};

global.APIKeys = {
    'https://api.xteam.xyz': process.env.XTEAM_API_KEY || '',
    'https://api.lolhuman.xyz': process.env.LOLHUMAN_API_KEY || '',
    'https://api.neoxr.my.id': process.env.NEOXR_API_KEY || '',
    'https://violetics.pw': process.env.VIOLETICS_API_KEY || '',
    'https://zenzapis.xyz': process.env.ZENZAPIS_API_KEY || '',
    'https://api-fgmods.ddns.net': process.env.FGMODS_API_KEY || ''
};

module.exports = {
    WARN_COUNT: 3,
    APIs: global.APIs,
    APIKeys: global.APIKeys
};
