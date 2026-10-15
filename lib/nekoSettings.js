'use strict';
// Adult image mode is permanently disabled. This compatibility module cannot enable it.
function isNsfwEnabled() { return false; }
function setNsfwEnabled() { return false; }
module.exports = { isNsfwEnabled, setNsfwEnabled };
