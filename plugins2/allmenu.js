// Disabled duplicate.
//
// A second "allmenu" implementation used to live here alongside
// ../plugins/allmenu.js. The command loader (lib/commandHandler.js) always
// keeps the first registration and silently skips later ones with the same
// name, so this file was dead code - except it also ignored context.prefix
// and fell back to a hardcoded '۞' prefix instead of the bot's configured
// prefix, which meant that IF it ever did get registered (e.g. if
// plugins/allmenu.js were ever renamed or load order changed) it would show
// the wrong command prefix throughout the "ALL MENU" carousel.
//
// The real, maintained implementation is ../plugins/allmenu.js. This file no
// longer exports a `command`, so the loader ignores it entirely.
module.exports = {};
