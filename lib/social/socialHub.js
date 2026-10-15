let hubPromise;
function loadSocialHub(){ hubPromise ||= import('./socialHub.mjs'); return hubPromise; }
const names=['tiktokSearch','tiktokHashtag','tiktokComments','tiktokProfile','tiktokVideo','instagramSearch','instagramProfile','instagramComments','instagramAll','facebookSearch','facebookPosts','facebookComments','redditSearch','redditPost','redditSubreddit','pinterestSearch','pinterestBoard','pinterestProfile','pinterestLens','youtubeSearch','youtubeVideo','youtubeChannel','xSearch','xProfile','linkedinPeople','linkedinPosts','linkedinJobs','threadsSearch','threadsProfile','threadsThread','snapchatProfiles'];
const api={loadSocialHub};
for(const name of names) api[name]=async(...args)=>{ const hub=await loadSocialHub(); if(typeof hub[name]!=='function') throw new Error(`${name} provider is unavailable`); return hub[name](...args); };
module.exports=api;
