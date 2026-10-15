// Canonical cricmenu implementation lives in plugins/cricket.js.
// Preserve the helper exports for any internal require() callers without
// registering a second cricmenu command.
const canonical = require('../plugins/cricket');

module.exports = {
  sendRandomImage: canonical.sendRandomImage,
  sendRandomVideo: canonical.sendRandomVideo,
};
