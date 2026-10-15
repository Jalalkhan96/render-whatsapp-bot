'use strict';
const { makeQuickReply, makeCarouselCard, buildCarouselContent } = require('../nativeFlow');

function build() {
  const cards = [
    makeCarouselCard({
      title: '🤖 AI TOOLS',
      body: 'Ask questions, generate text, and more.',
      footer: 'Card 1',
      buttons: [makeQuickReply('OPEN AI', '-aimenu')],
    }),
    makeCarouselCard({
      title: '🎮 GAMES',
      body: 'Open the Game Arcade.',
      footer: 'Card 2',
      buttons: [makeQuickReply('OPEN GAMES', '-gamemenu')],
    }),
    makeCarouselCard({
      title: '📘 SOCIAL',
      body: 'Open social-media tools.',
      footer: 'Card 3',
      buttons: [makeQuickReply('OPEN SOCIAL', '-socialmenu')],
    }),
  ];

  return buildCarouselContent({
    body: 'Browse ABIX-AE sections.',
    footer: 'Experimental Carousel Demo',
    cards,
  });
}

module.exports = { name: 'carousel', build };
