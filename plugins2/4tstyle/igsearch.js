const { makeSearchPlugin } = require('../../Sliderchecking/4tstyle/factory');
module.exports = makeSearchPlugin({
 command:'igsearch', aliases:['igs','instagramsearch','ig-s'], title:'📸 ABIX-AE IG SEARCH', search:'instagramSearch',
 buttons:()=>[{text:'🎧 AUDIO',action:'audio'},{text:'🎬 VIDEO',action:'video'},{text:'🔗 OPEN',action:'open'}],
});
