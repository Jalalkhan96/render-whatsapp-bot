'use strict';

const styles = require('./styles');
const { sendNativeFlow } = require('./nativeFlow');

const DEMOS = [
  ['uistackedtest', styles.stackedCards],
  ['uicategorytest', styles.categorySelector],
  ['uisettingstest', styles.settingsPanel],
  ['uiurltest', styles.urlActions],
  ['uicopytest', styles.copyCode],
  ['uicalltest', styles.callSupport],
  ['uimediatest', styles.mediaHeader],
  ['uimixedtest', styles.mixedActions],
  ['uilargetest', styles.largeMenu],
  ['uicarouseltest', styles.carousel],
];

function makeCommand(command, style) {
  return {
    command,
    aliases: [],
    category: 'plugin3',
    description: `Isolated ${style.name} UI test`,
    async handler(sock, message, args, context = {}) {
      const jid = context.chatId || message?.key?.remoteJid;
      if (!jid) throw new Error('Chat JID is missing.');

      // Carousel uses a separate payload shape and should currently be payload-tested
      // rather than force-fed through the single native-flow sender.
      if (style === styles.carousel) {
        if (typeof sock.sendMessage === 'function') {
          return sock.sendMessage(jid, {
            text: JSON.stringify(style.build(), null, 2),
          });
        }
        throw new Error('Carousel demo requires a dedicated carousel sender.');
      }

      return sendNativeFlow(sock, jid, style.build(), {
        quoted: undefined,
      });
    },
  };
}

module.exports = DEMOS.map(([command, style]) => makeCommand(command, style));
