'use strict';
const canonical = require('../plugins2/warn');
module.exports = { handler: canonical.handler || null, _canonical: canonical };
