'use strict';
const canonical = require('../plugins2/sticker');
module.exports = { handler: canonical.handler || null, _canonical: canonical };
