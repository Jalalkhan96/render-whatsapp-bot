'use strict';
/**
 * ABIX NADD command entrypoint.
 * This top-level .js bridge ensures NADD loads even when an older command
 * loader scans only plugins2/*.js. The implementation stays in .cjs so raw
 * engine internals are not mistaken for command plugins.
 */
module.exports = require('./nadd/nadd-registry.cjs');
