'use strict';
const {
  makeQuickReply,
  makeUrl,
  makeCopy,
  makeCall,
  buildNativeFlowContent,
} = require('../nativeFlow');

function build() {
  return buildNativeFlowContent({
    title: 'ABIX TOOLS',
    body: 'Choose an action.',
    footer: 'Mixed Native Actions',
    buttons: [
      makeQuickReply('⚡ RUN COMMAND', 'tools:run'),
      makeUrl('🌐 OPEN WEBSITE', 'https://example.com/'),
      makeCopy('📋 COPY ID', 'ABIX-DEMO-001', 'tool_id'),
      makeCall('📞 CONTACT OWNER', '+1234567890'),
    ],
  });
}

module.exports = { name: 'mixed_actions', build };
