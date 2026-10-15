'use strict';
const { makeUrl, buildNativeFlowContent } = require('../nativeFlow');

function build() {
  return buildNativeFlowContent({
    title: 'OFFICIAL LINKS',
    body: 'Open an ABIX-AE resource.',
    footer: 'TEAM ABIX',
    buttons: [
      makeUrl('🔗 GitHub', 'https://github.com/'),
      makeUrl('🌐 Website', 'https://example.com/'),
      makeUrl('📢 Channel', 'https://whatsapp.com/'),
    ],
  });
}

module.exports = { name: 'url_actions', build };
