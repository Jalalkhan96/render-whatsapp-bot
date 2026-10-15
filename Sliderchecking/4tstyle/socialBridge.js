const path = require('path');
let cached;
async function loadHub() {
  if (cached) return cached;
  const candidates = [
    path.resolve(process.cwd(),'lib/social/socialHub.mjs'),
    path.resolve(process.cwd(),'node-social-hub/socialHub.mjs'),
    path.resolve(process.cwd(),'socialHub.mjs'),
  ];
  for (const file of candidates) {
    try {
      const mod = await import(file);
      cached = mod.default ? {...mod.default,...mod} : mod;
      return cached;
    } catch {}
  }
  throw new Error('Social Hub not found. Expected lib/social/socialHub.mjs or node-social-hub/socialHub.mjs.');
}
async function call(name,query,options={}) {
  const hub=await loadHub();
  const fn=hub[name];
  if (typeof fn!=='function') throw new Error(`Social Hub function ${name}() is not available.`);
  let result;
  try { result=await fn(query,options); }
  catch(first) {
    try { result=await fn({query,...options}); } catch { throw first; }
  }
  return Array.isArray(result) ? result : (result?.items||result?.results||result?.data||result?.videos||result?.posts||[]);
}
module.exports={
  tiktokSearch:q=>call('tiktokSearch',q,{resultsPerPage:8}),
  instagramSearch:q=>call('instagramSearch',q,{resultsPerPage:8}),
  facebookSearch:q=>call('facebookSearch',q,{resultsPerPage:8}),
  redditSearch:q=>call('redditSearch',q,{resultsPerPage:8}),
  pinterestSearch:q=>call('pinterestSearch',q,{resultsPerPage:8}),
  youtubeSearch:q=>call('youtubeSearch',q,{maxResults:8}),
  xSearch:q=>call('xSearch',q,{maxItems:8}),
  linkedinPeople:q=>call('linkedinPeople',q,{maxItems:8}),
  linkedinPosts:q=>call('linkedinPosts',q,{maxItems:8}),
  linkedinJobs:q=>call('linkedinJobs',q,{maxItems:8}),
  threadsSearch:q=>call('threadsSearch',q,{maxPosts:8}),
  snapchatProfiles:q=>call('snapchatProfiles',q,{maxItems:8}),
};
