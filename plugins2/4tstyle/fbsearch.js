const { makeSearchPlugin } = require('../../Sliderchecking/4tstyle/factory');
module.exports = makeSearchPlugin({
 command:'fbsearch', aliases:['fbs','facebooksearch','fb-s'], title:'📘 ABIX-AE FB SEARCH', search:'facebookSearch',
 buttons:()=>[{text:'🎬 VIDEO',action:'video'},{text:'🔗 OPEN',action:'open'},{text:'📋 COPY',action:'copy'}],
});
