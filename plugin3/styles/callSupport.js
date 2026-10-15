'use strict';
const { makeCall, buildNativeFlowContent } = require('../nativeFlow');

function build() {
  return buildNativeFlowContent({
    title: 'SUPPORT',
    body: 'Contact the support line.',
    footer: 'ABIX-AE Support',
    buttons: [makeCall('📞 CALL SUPPORT', '+1234567890')],
  });
}

module.exports = { name: 'call_support', build };
