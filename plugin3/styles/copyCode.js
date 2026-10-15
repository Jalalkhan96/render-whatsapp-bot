'use strict';
const { makeCopy, buildNativeFlowContent } = require('../nativeFlow');

function build() {
  return buildNativeFlowContent({
    title: 'API CONFIG',
    body: 'Copy the sample gateway identifier.',
    footer: 'Copy Action Demo',
    buttons: [makeCopy('📋 COPY ID', 'ABIX-7F92-KD81', 'gateway_id')],
  });
}

module.exports = { name: 'copy_code', build };
