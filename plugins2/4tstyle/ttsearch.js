const { makeSearchPlugin } = require('../../Sliderchecking/4tstyle/factory');
module.exports = makeSearchPlugin({
 command:'ttsearch', aliases:['tts','tiktoksearch','tt-s'], title:'🎵 ABIX-AE TT SEARCH', search:'tiktokSearch',
 buttons:()=>[{text:'🎧 AUDIO',action:'audio'},{text:'🎬 VIDEO',action:'video'},{text:'🔗 OPEN',action:'open'}],
});
