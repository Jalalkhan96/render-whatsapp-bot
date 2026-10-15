'use strict';

const { isJidGroup } = require('@whiskeysockets/baileys');

/**
 * Binary relay nodes required by WhatsApp native-flow messages.
 * Deliberately contains no forwarded/channel metadata.
 */
function buildInteractiveAdditionalNodes(jid, includeQualityControl = true) {
  const biz = {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: String(Math.floor(Date.now() / 1000) - 77980457),
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [
          { tag: 'native_flow', attrs: { v: '9', name: 'mixed' } },
        ],
      },
    ],
  };

  if (includeQualityControl) {
    biz.content.push({
      tag: 'quality_control',
      attrs: { source_type: 'third_party' },
    });
  }

  return isJidGroup(jid)
    ? [biz]
    : [biz, { tag: 'bot', attrs: { biz_bot: '1' } }];
}

module.exports = { buildInteractiveAdditionalNodes };
