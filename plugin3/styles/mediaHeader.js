'use strict';
const { buildNativeFlowContent, makeQuickReply } = require('../nativeFlow');

function build() {
  return buildNativeFlowContent({
    title: 'ABIX-AE',
    body: 'Interactive menu with a media header. Pass a prepared imageMessage/videoMessage at send time.',
    footer: 'Media Header Demo',
    media: {
      type: 'video',
      message: {
        url: 'assets/bot_top.mp4',
        mimetype: 'video/mp4',
        gifPlayback: true,
      },
    },
    buttons: [
      makeQuickReply('📋 MENU', '-menu'),
      makeQuickReply('📚 ALL MENU', '-allmenu'),
      makeQuickReply('👥 GROUP', '-gcmenu'),
    ],
  });
}

module.exports = { name: 'media_header', build };
