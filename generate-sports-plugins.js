const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'plugins2');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const apis = [
  // ESPN Scoreboards
  { 
    cmd: 'cricket', 
    url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8039/scoreboard', 
    parser: 'res.data.events && res.data.events[0] ? "🏏 Match: " + res.data.events[0].name + "\\nStatus: " + res.data.events[0].status.type.detail : "Koi live match nahi chal raha!"', 
    cat: 'sports' 
  },
  { 
    cmd: 'football', 
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', 
    parser: 'res.data.events && res.data.events[0] ? "⚽ Match: " + res.data.events[0].name + "\\nStatus: " + res.data.events[0].status.type.detail : "Koi football match nahi chal raha!"', 
    cat: 'sports' 
  },
  { 
    cmd: 'nba', 
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', 
    parser: 'res.data.events && res.data.events[0] ? "🏀 Match: " + res.data.events[0].name + "\\nStatus: " + res.data.events[0].status.type.detail : "Koi NBA match nahi chal raha!"', 
    cat: 'sports' 
  },
  { 
    cmd: 'nfl', 
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', 
    parser: 'res.data.events && res.data.events[0] ? "🏈 Match: " + res.data.events[0].name + "\\nStatus: " + res.data.events[0].status.type.detail : "Koi NFL match nahi chal raha!"', 
    cat: 'sports' 
  },
  
  // E-Sports
  { 
    cmd: 'dota2', 
    url: 'https://api.opendota.com/api/proMatches', 
    parser: 'res.data[0] ? "🎮 DOTA 2 Pro Match\\nLeague: " + res.data[0].league_name + "\\n" + res.data[0].radiant_name + " vs " + res.data[0].dire_name + "\\nWinner: " + (res.data[0].radiant_win ? res.data[0].radiant_name : res.data[0].dire_name) : "No match found"', 
    cat: 'esports' 
  },
  { 
    cmd: 'chess', 
    url: 'https://lichess.org/api/tv', 
    parser: '"♟️ Live Chess (Lichess TV)\\nWhite: " + res.data.white.name + " (" + res.data.white.rating + ")\\nBlack: " + res.data.black.name + " (" + res.data.black.rating + ")" ', 
    cat: 'esports' 
  },
  
  // TheSportsDB (Search)
  { 
    cmd: 'team', 
    url: 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=', 
    dynamicArg: true, 
    argError: 'Team ka naam likho bhai!', 
    parser: 'res.data.teams && res.data.teams[0] ? "🏟️ Team: " + res.data.teams[0].strTeam + "\\nSport: " + res.data.teams[0].strSport + "\\nLeague: " + res.data.teams[0].strLeague + "\\nStadium: " + res.data.teams[0].strStadium : "Team nahi mili!"', 
    parserImg: 'res.data.teams && res.data.teams[0] ? res.data.teams[0].strTeamBadge : null',
    cat: 'sports' 
  },
  { 
    cmd: 'player', 
    url: 'https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=', 
    dynamicArg: true, 
    argError: 'Player ka naam likho bhai!', 
    parser: 'res.data.player && res.data.player[0] ? "🏃 Player: " + res.data.player[0].strPlayer + "\\nSport: " + res.data.player[0].strSport + "\\nTeam: " + res.data.player[0].strTeam + "\\nNationality: " + res.data.player[0].strNationality : "Player nahi mila!"', 
    parserImg: 'res.data.player && res.data.player[0] ? res.data.player[0].strThumb : null',
    cat: 'sports' 
  },
  
  // General Sports Info
  {
    cmd: 'allsports',
    url: 'https://www.thesportsdb.com/api/v1/json/3/all_sports.php',
    parser: '"Available Sports: " + res.data.sports.slice(0, 10).map(s => s.strSport).join(", ") + " and many more..."',
    cat: 'sports'
  },
  {
    cmd: 'f1',
    url: 'https://ergast.com/api/f1/current/last/results.json',
    parser: 'res.data.MRData.RaceTable.Races[0] ? "🏎️ F1 Race: " + res.data.MRData.RaceTable.Races[0].raceName + "\\nWinner: " + res.data.MRData.RaceTable.Races[0].Results[0].Driver.givenName + " " + res.data.MRData.RaceTable.Races[0].Results[0].Driver.familyName + " (" + res.data.MRData.RaceTable.Races[0].Results[0].Constructor.name + ")" : "Koi recent race nahi mili!"',
    cat: 'sports'
  }
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

      const finalTxt = \`╭───「 🏆 *${api.cmd.toUpperCase()}* 」\\n│\\n│ \` + (txt || 'Result found!').replace(/\\n/g, '\\n│ ') + \`\\n│\\n╰───「 ✨ ABIX AE 」\`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('${api.cmd} error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
`;

  const filePath = path.join(outputDir, `${api.cmd}.js`);
  fs.writeFileSync(filePath, content);
  console.log(`Generated: ${api.cmd}.js`);
});

console.log('Successfully generated 10 sports plugins in plugins2/ directory!');
