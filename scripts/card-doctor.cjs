'use strict';
const fs = require('fs');
const path = require('path');
const { loadCards, DESIGNS } = require('../lib/animeCard.cjs');
const cards = loadCards();
const bad = cards.filter(c => !c.id || !c.character || !c.series || (!c.imageUrl && !c.gifUrl));
console.log(`[card-doctor] cards=${cards.length} designs=${DESIGNS.length} invalid=${bad.length}`);
if (bad.length) { for (const c of bad.slice(0, 10)) console.log(JSON.stringify(c)); process.exitCode = 1; }
const state = path.join(__dirname, '../data/anime-cards/scrape-state.json');
console.log(`[card-doctor] state=${fs.existsSync(state) ? 'ok' : 'missing (will be created by scraper)'}`);
