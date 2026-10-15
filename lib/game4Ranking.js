const fs=require('fs');
const path=require('path');
const FILE=path.join(__dirname,'../data/game4-ranking.json');
const NON_ROUND=new Set(['move','drop','join','end','guess','answer','attempt','pick','choose','hit','stand','fold','call','raise','check','deal','bet','playagain']);

function load(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'));}catch{return {version:1,updatedAt:null,games:{}};}}
let db=load();
function save(){db.updatedAt=new Date().toISOString();fs.mkdirSync(path.dirname(FILE),{recursive:true});const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,FILE);}
function norm(v){return String(v||'').trim();}
function safeGame(g){return norm(g).toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,80)||'unknown';}
function ensure(game,jid){const g=safeGame(game);if(!db.games[g])db.games[g]={game:g,players:{},totalActions:0,totalRounds:0,totalWins:0,totalLosses:0,totalDraws:0};if(jid){const p=norm(jid);if(!db.games[g].players[p])db.games[g].players[p]={jid:p,actions:0,rounds:0,wins:0,losses:0,draws:0,points:0,lastPlayed:null};return db.games[g].players[p];}return db.games[g];}
function unique(xs){return [...new Set((xs||[]).map(norm).filter(Boolean))];}
function scoreFor(result){return result==='win'?3:result==='draw'?1:0;}
function outcomeFromReply(text, sender, mentions){const t=String(text||'').toLowerCase();const ms=unique(mentions);if(/\bdraw\b|\btie\b|🤝/.test(t))return {draw:ms.length?ms:[sender]};if(/bot wins|you lose|you lost|you lose!|bot won|defeat/.test(t))return {loss:[sender]};if(/you win|you won|wins!|winner|🏆/.test(t)){if(ms.length){const first=ms[0];if(/you win|you won/.test(t)&&!t.includes('@'))return {win:[sender]};return {win:[first],loss:ms.slice(1).filter(x=>x!==first)};}return {win:[sender]};}return null;}
function record(game,{sender,participants=[],sub='',replyText='',replyMentions=[]}){
 const g=ensure(game);const players=unique([sender,...participants]);const now=new Date().toISOString();
 for(const jid of players){const p=ensure(game,jid);p.actions++;p.lastPlayed=now;}
 g.totalActions+=1;
 const isRound=!NON_ROUND.has(String(sub||'').toLowerCase());
 if(isRound){g.totalRounds++;for(const jid of players)ensure(game,jid).rounds++;}
 const result=outcomeFromReply(replyText,sender,replyMentions);if(!result){save();return;}
 const winners=unique(result.win), losers=unique(result.loss), draws=unique(result.draw);
 for(const jid of winners){const p=ensure(game,jid);p.wins++;p.points+=3;g.totalWins++;}
 for(const jid of losers){const p=ensure(game,jid);p.losses++;g.totalLosses++;}
 for(const jid of draws){const p=ensure(game,jid);p.draws++;p.points+=1;g.totalDraws++;}
 save();
}
function allGames(){return Object.values(db.games);}
function leaderboard(game,limit=10){const g=db.games[safeGame(game)];if(!g)return [];return Object.values(g.players).sort((a,b)=>(b.points-a.points)||(b.wins-a.wins)||(b.draws-a.draws)||(b.rounds-a.rounds)||(b.actions-a.actions)).slice(0,limit);}
function playerStats(jid,game=null){const out=[];for(const g of allGames()){if(game&&safeGame(game)!==g.game)continue;const p=g.players[norm(jid)];if(p)out.push({...p,game:g.game});}return out;}
function globalLeaderboard(limit=15){const map=new Map();for(const g of allGames())for(const p of Object.values(g.players)){const cur=map.get(p.jid)||{jid:p.jid,points:0,wins:0,losses:0,draws:0,rounds:0,actions:0};for(const k of ['points','wins','losses','draws','rounds','actions'])cur[k]+=p[k]||0;map.set(p.jid,cur);}return [...map.values()].sort((a,b)=>(b.points-a.points)||(b.wins-a.wins)||(b.rounds-a.rounds)).slice(0,limit);}
function gameSummary(game){const g=db.games[safeGame(game)];if(!g)return null;return {game:g.game,players:Object.keys(g.players).length,rounds:g.totalRounds,actions:g.totalActions,wins:g.totalWins,losses:g.totalLosses,draws:g.totalDraws};}
module.exports={record,leaderboard,globalLeaderboard,playerStats,gameSummary,allGames,safeGame};
