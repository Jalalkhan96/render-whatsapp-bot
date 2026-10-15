const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'plugins2');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// 50 Awesome, safe, realistic public APIs
const apis = [
  // 1-10: Funny / Text
  { cmd: 'joke', url: 'https://official-joke-api.appspot.com/random_joke', parser: 'res.data.setup + "\\n\\n" + res.data.punchline', cat: 'fun' },
  { cmd: 'chuck', url: 'https://api.chucknorris.io/jokes/random', parser: 'res.data.value', cat: 'fun' },
  { cmd: 'catfact', url: 'https://catfact.ninja/fact', parser: 'res.data.fact', cat: 'fun' },
  { cmd: 'dogfact', url: 'https://dog-api.kinduff.com/api/facts', parser: 'res.data.facts[0]', cat: 'fun' },
  { cmd: 'bored', url: 'https://www.boredapi.com/api/activity', parser: 'res.data.activity', cat: 'fun' },
  { cmd: 'kanye', url: 'https://api.kanye.rest/', parser: 'res.data.quote', cat: 'fun' },
  { cmd: 'meowfact', url: 'https://meowfacts.herokuapp.com/', parser: 'res.data.data[0]', cat: 'fun' },
  { cmd: 'uselessfact', url: 'https://uselessfacts.jsph.pl/api/v2/facts/random', parser: 'res.data.text', cat: 'fun' },
  { cmd: 'trivia', url: 'https://opentdb.com/api.php?amount=1&type=boolean', parser: '"Q: " + res.data.results[0].question + "\\nAns: " + res.data.results[0].correct_answer', cat: 'fun' },
  { cmd: 'adviceslip', url: 'https://api.adviceslip.com/advice', parser: 'res.data.slip.advice', cat: 'fun' },

  // 11-20: Animals / Image
  { cmd: 'dog', url: 'https://dog.ceo/api/breeds/image/random', parserImg: 'res.data.message', cat: 'image' },
  { cmd: 'cat', url: 'https://api.thecatapi.com/v1/images/search', parserImg: 'res.data[0].url', cat: 'image' },
  { cmd: 'fox', url: 'https://randomfox.ca/floof/', parserImg: 'res.data.image', cat: 'image' },
  { cmd: 'duck', url: 'https://random-d.uk/api/random', parserImg: 'res.data.url', cat: 'image' },
  { cmd: 'coffee', url: 'https://coffee.alexflipnote.dev/random.json', parserImg: 'res.data.file', cat: 'image' },
  { cmd: 'food', url: 'https://foodish-api.com/api/', parserImg: 'res.data.image', cat: 'image' },
  { cmd: 'yesno', url: 'https://yesno.wtf/api', parserImg: 'res.data.image', parser: 'res.data.answer', cat: 'fun' },
  { cmd: 'shiba', url: 'http://shibe.online/api/shibes?count=1', parserImg: 'res.data[0]', cat: 'image' },
  { cmd: 'bird', url: 'http://shibe.online/api/birds?count=1', parserImg: 'res.data[0]', cat: 'image' },
  { cmd: 'popcat', url: 'https://api.popcat.xyz/car', parserImg: 'res.data.image', parser: 'res.data.title', cat: 'image' },

  // 21-40: Anime SFW Reactions (Waifu.pics & Nekos.best)
  { cmd: 'hug', url: 'https://api.waifu.pics/sfw/hug', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'pat', url: 'https://api.waifu.pics/sfw/pat', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'kiss', url: 'https://api.waifu.pics/sfw/kiss', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'cringe', url: 'https://api.waifu.pics/sfw/cringe', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'cry', url: 'https://api.waifu.pics/sfw/cry', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'cuddle', url: 'https://api.waifu.pics/sfw/cuddle', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'awoo', url: 'https://api.waifu.pics/sfw/awoo', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'smug', url: 'https://api.waifu.pics/sfw/smug', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'bonk', url: 'https://api.waifu.pics/sfw/bonk', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'yeet', url: 'https://api.waifu.pics/sfw/yeet', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'blush', url: 'https://api.waifu.pics/sfw/blush', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'smile', url: 'https://api.waifu.pics/sfw/smile', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'wave', url: 'https://api.waifu.pics/sfw/wave', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'highfive', url: 'https://api.waifu.pics/sfw/highfive', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'handhold', url: 'https://api.waifu.pics/sfw/handhold', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'nom', url: 'https://api.waifu.pics/sfw/nom', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'bite', url: 'https://api.waifu.pics/sfw/bite', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'glomp', url: 'https://api.waifu.pics/sfw/glomp', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'slap', url: 'https://api.waifu.pics/sfw/slap', parserImg: 'res.data.url', cat: 'anime' },
  { cmd: 'dance', url: 'https://api.waifu.pics/sfw/dance', parserImg: 'res.data.url', cat: 'anime' },

  // 41-50: Utilities / Tech / More 
  { cmd: 'genderize', url: 'https://api.genderize.io?name=', dynamicArg: true, argError: 'Naam likho bhai!', parser: '"Name: " + res.data.name + "\\nGender: " + res.data.gender + "\\nConfidence: " + res.data.probability', cat: 'info' },
  { cmd: 'nationalize', url: 'https://api.nationalize.io?name=', dynamicArg: true, argError: 'Naam likho bhai!', parser: '"Name: " + res.data.name + "\\nCountry: " + (res.data.country[0] ? res.data.country[0].country_id : "Unknown")', cat: 'info' },
  { cmd: 'excuse', url: 'https://excuser-three.vercel.app/v1/excuse', parser: 'res.data[0].excuse', cat: 'fun' },
  { cmd: 'ipinfo', url: 'https://ipapi.co/', suffix: '/json/', dynamicArg: true, argError: 'IP likho bhai!', parser: '"IP: " + res.data.ip + "\\nCity: " + res.data.city + "\\nCountry: " + res.data.country_name', cat: 'info' },
  { cmd: 'joke-prog', url: 'https://v2.jokeapi.dev/joke/Programming?type=single', parser: 'res.data.joke', cat: 'fun' },
  { cmd: 'joke-pun', url: 'https://v2.jokeapi.dev/joke/Pun?type=single', parser: 'res.data.joke', cat: 'fun' },
  { cmd: 'poke', url: 'https://pokeapi.co/api/v2/pokemon/', dynamicArg: true, argError: 'Pokemon naam likho!', parser: '"Name: " + res.data.name + "\\nWeight: " + res.data.weight', parserImg: 'res.data.sprites.front_default', cat: 'info' },
  { cmd: 'math', url: 'http://api.mathjs.org/v4/?expr=', dynamicArg: true, argError: 'Math formula likho!', parser: '"Result: " + res.data', cat: 'info' },
  { cmd: 'randomuser', url: 'https://randomuser.me/api/', parser: '"Name: " + res.data.results[0].name.first + " " + res.data.results[0].name.last + "\\nEmail: " + res.data.results[0].email + "\\nCountry: " + res.data.results[0].location.country', parserImg: 'res.data.results[0].picture.large', cat: 'info' },
  { cmd: 'bitcoin', url: 'https://api.coindesk.com/v1/bpi/currentprice.json', parser: '"Bitcoin Price:\\nUSD: $" + res.data.bpi.USD.rate', cat: 'info' }
];

apis.forEach(api => {
  const content = `const axios = require('axios');

module.exports = {
  command: '${api.cmd}',
  aliases: ['${api.cmd}api'],
  category: '${api.cat}',
  description: 'ABIX-AE Auto Generated Plugin - ${api.cmd}',
  usage: '.${api.cmd}',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    ${api.dynamicArg ? `
    const q = args.join(' ').trim();
    if (!q) {
      return await sock.sendMessage(chatId, { text: '❌ ${api.argError}' }, { quoted: message });
    }
    ` : ''}

    try {
      const apiUrl = \`${api.url}\` ${api.dynamicArg ? `+ encodeURIComponent(q)` : ''} ${api.suffix ? `+ \`${api.suffix}\`` : ''};
      const res = await axios.get(apiUrl);

      ${api.parserImg ? `const imgUrl = ${api.parserImg};` : 'const imgUrl = null;'}
      ${api.parser ? `const txt = ${api.parser};` : 'const txt = "";'}

      const finalTxt = \`╭───「 🌐 *${api.cmd.toUpperCase()}* 」\\n│\\n│ \` + (txt || 'Result found!').replace(/\\n/g, '\\n│ ') + \`\\n│\\n╰───「 ✨ ABIX AE 」\`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('${api.cmd} error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
`;

  const filePath = path.join(outputDir, `${api.cmd}.js`);
  fs.writeFileSync(filePath, content);
  console.log(`Generated: ${api.cmd}.js`);
});

console.log('Successfully generated 50 plugins in plugins2/ directory!');
