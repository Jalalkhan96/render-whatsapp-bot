'use strict';

// Loader bridge only. The actual Sliderchecking code stays separate.
// Existing commandHandler.js already scans plugins2, so no commandHandler
// modification is required.
module.exports = require('../Sliderchecking/slidermenu');
