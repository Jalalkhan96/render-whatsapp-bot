"use strict";
const video = require("./video");
module.exports = { ...video, command: "yt", aliases: ["youtube"], description: "YouTube video downloader using ytb-downloader-api", usage: "-yt [480|780] <query or YouTube URL>" };
