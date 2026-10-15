'use strict';

const assert = require('assert');
const styles = require('./styles');

const checks = [
  ['stackedCards', styles.stackedCards.build()],
  ['categorySelector', styles.categorySelector.build()],
  ['settingsPanel', styles.settingsPanel.build()],
  ['urlActions', styles.urlActions.build()],
  ['copyCode', styles.copyCode.build()],
  ['callSupport', styles.callSupport.build()],
  ['mediaHeader', styles.mediaHeader.build()],
  ['mixedActions', styles.mixedActions.build()],
  ['largeMenu', styles.largeMenu.build()],
  ['carousel', styles.carousel.build()],
];

for (const [name, payload] of checks) {
  assert.ok(payload && typeof payload === 'object', `${name}: payload missing`);

  if (payload.nativeFlowMessage) {
    assert.ok(Array.isArray(payload.nativeFlowMessage.buttons), `${name}: buttons missing`);
    for (const button of payload.nativeFlowMessage.buttons) {
      assert.ok(button.name, `${name}: button name missing`);
      assert.ok(button.buttonParamsJson, `${name}: button params missing`);
      JSON.parse(button.buttonParamsJson);
    }
  }

  if (payload.carouselMessage) {
    assert.ok(Array.isArray(payload.carouselMessage.cards), `${name}: cards missing`);
    assert.strictEqual(payload.carouselMessage.cards.length, 3);
  }
}

console.log(`✅ plugin3 style self-test passed: ${checks.length} styles`);
console.log('✅ Added styles: stacked cards, category selector, settings, URL, copy, call, media header, mixed actions, large-menu selector, carousel');
