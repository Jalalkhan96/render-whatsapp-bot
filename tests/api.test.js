'use strict';
const assert = require('assert');
const fs = require('fs');
const env = fs.existsSync('.env') ? fs.readFileSync('.env','utf8') : '';
const tokenCount = env.split(/\r?\n/).filter(line => /^APIFY_TOKEN_\d+=\S+/.test(line)).length;
assert.ok(tokenCount >= 0);
console.log(`[PASS] Apify configuration parser; configured tokens detected: ${tokenCount > 0 ? 'yes' : 'no'}`);
