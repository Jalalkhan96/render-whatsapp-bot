'use strict';

const { sendInteractiveMessage } = require('../../lib/interactiveMenu');
const { sendNativeHtmlGameWithFallback } = require('../../lib/richHtmlGame.cjs');
const sharp = (() => { try { return require('sharp'); } catch { return null; } })();

const sessions = new Map();
const MAX_AGE = 30 * 60 * 1000;

function sessionKey(jid, sender) { return `${jid}:${sender}`; }
function now() { return Date.now(); }
function getSession(jid, sender, game) {
  const key = sessionKey(jid, sender);
  const s = sessions.get(key);
  if (!s || s.game !== game || now() - s.updated > MAX_AGE) return null;
  return s;
}
function saveSession(jid, sender, state) {
  state.updated = now();
  sessions.set(sessionKey(jid, sender), state);
  return state;
}
function clearSession(jid, sender) { sessions.delete(sessionKey(jid, sender)); }

function btn(label, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: label, id }) };
}

function commonFooter() {
  return 'WhatsApp ke andar playable • koi file/download nahi';
}

/* ---------------- Rich HTML path (when the connected Baileys fork supports it) ---------------- */
async function tryRichHtml(sock, jid, html, title = 'GAME') {
  if (String(process.env.ABIX_RICH_HTML || 'true').toLowerCase() === 'false') return false;
  if (typeof sock?.relayMessage !== 'function') return false;
  try {
    await sendNativeHtmlGameWithFallback(sock, jid, html, {
      title,
      trustedSources: ['nixel.dev'],
      fallbackCaption: `🎮 ${title}`,
    });
    return true;
  } catch (e) {
    console.warn('[RICH HTML GAME] fallback:', e.message);
    return false;
  }
}

async function getPfpDataUri(sock, sender) {
  try {
    if (!sender || typeof sock?.profilePictureUrl !== 'function') return '';
    const url = await sock.profilePictureUrl(sender, 'image');
    if (!url || typeof fetch !== 'function') return '';
    const res = await fetch(url);
    if (!res.ok) return '';
    const ab = await res.arrayBuffer();
    let buf = Buffer.from(ab);
    if (sharp) buf = await sharp(buf).resize(96, 96, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

function htmlShell(title, body, css, js) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#070d19;color:#eef2ff;font-family:Arial,sans-serif;user-select:none;-webkit-user-select:none}
.wrap{max-width:680px;margin:auto;padding:18px}.card{background:#0f172a;border:1px solid #273449;border-radius:24px;padding:18px;box-shadow:0 18px 55px #0008}.top{display:flex;justify-content:space-between;align-items:center;gap:10px}.title{border:2px solid #f59e0b;border-radius:14px;padding:10px 16px;font-size:22px;font-weight:800;color:#fde68a}.pfp{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#1e293b}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.stat{background:#0a1020;border:1px solid #233047;border-radius:14px;padding:10px;text-align:center}.k{font-size:11px;color:#94a3b8}.v{font-size:22px;color:#f59e0b;font-weight:800}.board{border:1px solid #334155;border-radius:20px;background:#0b1222;min-height:300px;padding:12px;position:relative;overflow:hidden}.controls{margin-top:14px;display:flex;gap:10px;flex-wrap:wrap}.controls button{flex:1;min-width:130px;border:0;border-radius:16px;padding:15px 18px;font-size:17px;font-weight:800;background:#f59e0b;color:#111827}.small{background:#1e293b!important;color:#e2e8f0!important}.msg{padding:12px;text-align:center;color:#a7f3d0;font-weight:700}.mono{font-family:monospace}
${css||''}</style></head><body><div class="wrap"><div class="card">${body}</div></div><script>${js||''}</script></body></html>`;
}

function dinoHtml(pfp) {
  const safePfp = String(pfp || '').replace(/"/g, '&quot;');
  return htmlShell('Dino Runner', `
<div class="top"><div class="title">🦖 DINO RUNNER</div><img class="pfp" src="${safePfp}" onerror="this.style.display='none'"></div>
<div class="stats"><div class="stat"><div class="k">SCORE</div><div id="score" class="v">0</div></div><div class="stat"><div class="k">SPEED</div><div id="speed" class="v">1x</div></div><div class="stat"><div class="k">BEST</div><div id="best" class="v">0</div></div></div>
<div id="board" class="board"><div id="sky" style="height:220px;position:relative"><div style="position:absolute;left:10%;top:20px;font-size:42px">☁️</div><div style="position:absolute;left:62%;top:55px;font-size:42px">☁️</div><div id="dino" style="position:absolute;left:45px;bottom:18px;font-size:54px">🦖</div><div id="obs" style="position:absolute;right:10px;bottom:18px;font-size:48px">🌵</div></div><div style="border-top:4px dashed #475569;padding-top:5px"></div><div id="msg" class="msg">Tap JUMP to start running</div></div>
<div class="controls"><button id="jump">JUMP / TAP (SPACE) 🦖</button><button class="small" id="again">PLAY AGAIN</button></div>`,
`#dino{filter:drop-shadow(0 4px 4px #0006)}#obs{transition:right .16s linear}.over{font-size:24px;color:#fb7185;font-weight:800}`,
`let running=false,score=0,best=Number(localStorage.dinoBest||0),y=18,vy=0,obs=10,timer=null;const $=id=>document.getElementById(id);$('best').textContent=best;
function frame(){if(!running)return;vy+=1.15;y+=vy;if(y>18){y=18;vy=0}obs+=4+Math.min(score/45,5);if(obs>100)obs=4;document.querySelector('#dino').style.bottom=y+'px';document.querySelector('#obs').style.right=obs+'%';score++;$('score').textContent=score;$('speed').textContent=(1+Math.floor(score/40))+'x';if(obs>78&&obs<88&&y<34){running=false;clearInterval(timer);$('msg').innerHTML='<span class="over">GAME OVER</span><br>Score: '+score; if(score>best){best=score;localStorage.dinoBest=best;$('best').textContent=best;}return;}}
function jump(){if(!running){running=true;score=0;obs=4;$('msg').textContent='Running… jump over the cactus!';clearInterval(timer);timer=setInterval(frame,120)}if(y<=22){vy=13}}
$('jump').onclick=jump;$('again').onclick=()=>{running=false;clearInterval(timer);score=0;y=18;obs=4;$('score').textContent=0;$('speed').textContent='1x';$('msg').textContent='Tap JUMP to start running'};document.onkeydown=e=>{if(e.code==='Space')jump();};`);
}

function flappyHtml(pfp) {
  const safePfp = String(pfp || '').replace(/"/g, '&quot;');
  return htmlShell('Flappy Bird', `
<div class="top"><div class="title">🐤 FLAPPY BIRD</div><img class="pfp" src="${safePfp}" onerror="this.style.display='none'"></div>
<div class="stats"><div class="stat"><div class="k">SCORE</div><div id="score" class="v">0</div></div><div class="stat"><div class="k">HEIGHT</div><div id="height" class="v">4</div></div><div class="stat"><div class="k">BEST</div><div id="best" class="v">0</div></div></div>
<div id="board" class="board"><div id="world" style="height:280px;position:relative;overflow:hidden"><div id="bird" style="position:absolute;left:70px;top:120px;font-size:42px">🐤</div><div id="pipeTop" style="position:absolute;right:-20px;top:0;width:62px;background:#16a34a;border-radius:12px;height:92px"></div><div id="pipeBot" style="position:absolute;right:-20px;bottom:0;width:62px;background:#16a34a;border-radius:12px;height:110px"></div></div><div id="msg" class="msg">Tap FLAP to start</div></div>
<div class="controls"><button id="flap">FLAP / TAP 🐤</button><button class="small" id="again">PLAY AGAIN</button></div>`,
`button{touch-action:manipulation}`,
`let running=false,y=120,vy=0,pipe=100,gap=125,score=0,best=Number(localStorage.flappyBest||0),timer=null;const $=id=>document.getElementById(id);$('best').textContent=best;
function newGap(){gap=55+Math.random()*135; $('pipeTop').style.height=gap+'px';$('pipeBot').style.height=(280-gap-95)+'px';}
function frame(){if(!running)return;vy+=.8;y+=vy;pipe-=5;if(pipe<-15){pipe=100;score++;$('score').textContent=score;newGap()}$('bird').style.top=y+'px';$('height').textContent=Math.max(0,Math.round(7-y/40));$('pipeTop').style.right=pipe+'%';$('pipeBot').style.right=pipe+'%';let x=70;let wallX=(pipe*6.5);if(y<0||y>238||(wallX<100&&wallX>40&&(y<gap||y>gap+105))){running=false;clearInterval(timer);$('msg').innerHTML='<span class="over">GAME OVER</span><br>Score: '+score;if(score>best){best=score;localStorage.flappyBest=best;$('best').textContent=best;}}}
function flap(){if(!running){running=true;score=0;pipe=100;newGap();$('msg').textContent='Fly through the gap!';clearInterval(timer);timer=setInterval(frame,90)}vy=-10} $('flap').onclick=flap;$('again').onclick=()=>{running=false;clearInterval(timer);y=120;vy=0;pipe=100;score=0;$('bird').style.top=y+'px';$('score').textContent=0;$('msg').textContent='Tap FLAP to start';newGap()};newGap();document.onkeydown=e=>{if(e.code==='Space')flap()};`);
}

function snakeHtml(pfp) {
  const safePfp = String(pfp || '').replace(/"/g, '&quot;');
  return htmlShell('Snake', `
<div class="top"><div class="title">🐍 SNAKE</div><img class="pfp" src="${safePfp}" onerror="this.style.display='none'"></div>
<div class="stats"><div class="stat"><div class="k">SCORE</div><div id="score" class="v">0</div></div><div class="stat"><div class="k">SIZE</div><div id="size" class="v">3</div></div><div class="stat"><div class="k">BEST</div><div id="best" class="v">0</div></div></div>
<div id="board" class="board"><div id="grid" style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px"></div><div id="msg" class="msg">Use arrow keys or the buttons</div></div>
<div class="controls"><button class="small" id="up">⬆️ UP</button><button class="small" id="left">⬅️ LEFT</button><button class="small" id="down">⬇️ DOWN</button><button class="small" id="right">➡️ RIGHT</button><button id="again">PLAY AGAIN</button></div>`, '',
`const W=12,H=12,$=id=>document.getElementById(id);let s=[],d={x:1,y:0},food={x:6,y:6},score=0,best=Number(localStorage.snakeBest||0),timer=null,run=true;function reset(){s=[{x:4,y:6},{x:3,y:6},{x:2,y:6}];d={x:1,y:0};score=0;run=true;food={x:8,y:4};clearInterval(timer);timer=setInterval(step,150);render();$('msg').textContent='Eat the red dot — don’t hit the wall or yourself'}function place(){do{food={x:Math.floor(Math.random()*W),y:Math.floor(Math.random()*H)}}while(s.some(p=>p.x===food.x&&p.y===food.y))}function render(){const g=$('grid');g.innerHTML='';for(let y=0;y<H;y++)for(let x=0;x<W;x++){const c=document.createElement('div');c.style.height='23px';c.style.borderRadius='5px';c.style.background='#172033';if(food.x===x&&food.y===y)c.textContent='🍎';if(s.some((p,i)=>p.x===x&&p.y===y))c.textContent=s.findIndex(p=>p.x===x&&p.y===y)===0?'🟢':'🟩';g.appendChild(c)}$('score').textContent=score;$('size').textContent=s.length}function setDir(x,y){if(d.x===-x&&d.y===-y)return;d={x,y}}function step(){if(!run)return;const h={x:s[0].x+d.x,y:s[0].y+d.y};if(h.x<0||h.y<0||h.x>=W||h.y>=H||s.some(p=>p.x===h.x&&p.y===h.y)){run=false;clearInterval(timer);$('msg').innerHTML='<span class="over">GAME OVER</span><br>Score: '+score;if(score>best){best=score;localStorage.snakeBest=best;$('best').textContent=best}return}s.unshift(h);if(h.x===food.x&&h.y===food.y){score++;place()}else{s.pop()}render()}$('up').onclick=()=>setDir(0,-1);$('down').onclick=()=>setDir(0,1);$('left').onclick=()=>setDir(-1,0);$('right').onclick=()=>setDir(1,0);$('again').onclick=reset;document.onkeydown=e=>({ArrowUp:()=>setDir(0,-1),ArrowDown:()=>setDir(0,1),ArrowLeft:()=>setDir(-1,0),ArrowRight:()=>setDir(1,0)}[e.key]?.());reset();`);
}

/* ---------------- native interactive fallback ---------------- */
function renderFallback(sock, jid, sender, game, action, prefix, quoted) {
  if (game === 'dino') {
    let s = getSession(jid, sender, 'dino');
    if (!s || action === 'restart') s = saveSession(jid, sender, { game:'dino', tick:0, score:0, best:0, obstacle:false, jump:0 });
    if (action === 'jump') { s.tick++; s.jump=1; s.obstacle=(s.tick%4===0 || Math.random()<.18); s.score++; }
    else if (action === 'wait') { s.tick++; s.jump=0; s.obstacle=(s.tick%3===0 || Math.random()<.24); s.score++; }
    else if (action && action !== 'restart') { s.tick++; s.score++; }
    if (s.obstacle && !s.jump && action !== 'restart') { const score=s.score; clearSession(jid,sender); return sendInteractiveMessage(sock,jid,{header:{title:'🦖 GAME OVER'},body:`Score: ${score}\n\n🌵 Obstacle hit!`,footer:commonFooter(),buttons:[btn('🔄 PLAY AGAIN',`${prefix}dinorunner restart`)]},{quoted}).catch(()=>{}); }
    const speed=(1+Math.floor(s.score/10));
    return sendInteractiveMessage(sock,jid,{header:{title:'🦖 DINO RUNNER'},body:`🦖 ${s.jump?'🆙':'🏃'} ............. ${s.obstacle?'🌵':'🟩'}\n\nScore: *${s.score}*   Speed: *${speed}x*\n\nTap *JUMP* before an obstacle.`,footer:commonFooter(),buttons:[btn('🦖 JUMP',`${prefix}dinorunner jump`),btn('🏃 RUN',`${prefix}dinorunner wait`),btn('🔄 RESTART',`${prefix}dinorunner restart`)]},{quoted});
  }
  if (game === 'flappy') {
    let s = getSession(jid,sender,'flappy');
    if (!s || action === 'restart') s=saveSession(jid,sender,{game:'flappy',y:3,score:0,pipe:6});
    if(action==='flap') s.y=Math.max(0,s.y-1); else if(action==='wait') s.y=Math.min(6,s.y+1); s.score++;
    s.pipe--; if(s.pipe<=0){s.pipe=6;s.gap=2+Math.floor(Math.random()*4)}
    const gap=s.gap??4; const safe=Math.abs(s.y-gap)<=1;
    if(!safe){const score=s.score;clearSession(jid,sender);return sendInteractiveMessage(sock,jid,{header:{title:'🐤 GAME OVER'},body:`Score: ${score}\n\n🧱 Pipe collision!`,footer:commonFooter(),buttons:[btn('🔄 PLAY AGAIN',`${prefix}flappy restart`)]},{quoted}).catch(()=>{});}
    const rows=[];for(let r=0;r<7;r++) rows.push(r===s.y?'🐤':(r===gap?'🟨':'⬜')); return sendInteractiveMessage(sock,jid,{header:{title:'🐤 FLAPPY BIRD'},body:`${rows.join(' ')}\n\nScore: *${s.score}*\nFly through the gap 🟩`,footer:commonFooter(),buttons:[btn('🐤 FLAP',`${prefix}flappy flap`),btn('⏺ WAIT',`${prefix}flappy wait`),btn('🔄 RESTART',`${prefix}flappy restart`)]},{quoted});
  }
  if (game === 'snake') {
    let s=getSession(jid,sender,'snake');
    if(!s||action==='restart') s=saveSession(jid,sender,{game:'snake',body:[{x:2,y:2},{x:1,y:2},{x:0,y:2}],dir:{x:1,y:0},food:{x:5,y:4},score:0});
    const dirMap={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};if(dirMap[action]&&! (dirMap[action].x===-s.dir.x&&dirMap[action].y===-s.dir.y))s.dir=dirMap[action];
    const h={x:s.body[0].x+s.dir.x,y:s.body[0].y+s.dir.y};if(h.x<0||h.y<0||h.x>6||h.y>5||s.body.some(p=>p.x===h.x&&p.y===h.y)){const score=s.score;clearSession(jid,sender);return sendInteractiveMessage(sock,jid,{header:{title:'🐍 GAME OVER'},body:`Score: ${score}\n\n💥 Wall/body collision.`,footer:commonFooter(),buttons:[btn('🔄 PLAY AGAIN',`${prefix}snake restart`)]},{quoted}).catch(()=>{});}s.body.unshift(h);if(h.x===s.food.x&&h.y===s.food.y){s.score++;s.food={x:(s.food.x+3)%7,y:(s.food.y+2)%6}}else{s.body.pop()}
    const cells=[];for(let y=0;y<6;y++){let row='';for(let x=0;x<7;x++){if(s.food.x===x&&s.food.y===y)row+='🍎';else if(s.body.some((p,i)=>p.x===x&&p.y===y))row+=s.body.findIndex(p=>p.x===x&&p.y===y)===0?'🟢':'🟩';else row+='⬛'}cells.push(row)}return sendInteractiveMessage(sock,jid,{header:{title:'🐍 SNAKE'},body:`${cells.join('\n')}\n\nScore: *${s.score}*`,footer:commonFooter(),buttons:[btn('⬆️ UP',`${prefix}snake up`),btn('⬇️ DOWN',`${prefix}snake down`),btn('⬅️ LEFT',`${prefix}snake left`),btn('➡️ RIGHT',`${prefix}snake right`),btn('🔄 RESTART',`${prefix}snake restart`)]},{quoted});
  }
  return null;
}

async function play(sock, { jid, sender, game, action = '', prefix = '-', quoted = null }) {
  const pfp = await getPfpDataUri(sock, sender);
  let html = '';
  if (game === 'dino') html = dinoHtml(pfp);
  if (game === 'flappy') html = flappyHtml(pfp);
  if (game === 'snake') html = snakeHtml(pfp);
  const htmlTitles = { dino: 'Dino Runner', flappy: 'Flappy Bird', snake: 'Snake' };
  const htmlTitle = htmlTitles[game] || String(game || 'GAME');
  // All dedicated HTML games use the shared _stPayload-compatible sender.
  if (!action && html && await tryRichHtml(sock, jid, html, htmlTitle)) return { mode: 'rich-html' };
  // Commands inside a Rich HTML card are handled locally by the card. If rich HTML exists,
  // re-opening the command simply sends a fresh card.
  if (action === 'open' && html && await tryRichHtml(sock, jid, html, htmlTitle)) return { mode: 'rich-html' };
  return { mode: 'interactive', result: await renderFallback(sock, jid, sender, game, action, prefix, quoted) };
}

function gameMenuText(prefix='-') {
  return `🎮 *IN-CHAT GAME ARCADE*\n\n🦖 ${prefix}dinorunner — Dino Runner\n🐤 ${prefix}flappy — Flappy Bird\n🐍 ${prefix}snake — Snake\n\nYe games document/file ki form mein nahi bheje jate. Rich HTML supported ho to game WhatsApp ke andar render hota hai; warna native interactive buttons fallback hain.`;
}

module.exports = { play, gameMenuText, _sessions: sessions, dinoHtml, flappyHtml, snakeHtml };
