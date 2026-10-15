'use strict';

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, 'games');

const ARCADE_CATALOG = [
  { cmd: 'trivia', name: 'Trivia Pulse', icon: '🧠', desc: 'Trivia / Math Hard' },
  { cmd: 'wyr', name: 'Would You Rather', icon: '🤔', desc: 'Choose your side' },
  { cmd: 'rps', name: 'Rock Paper Scissors', icon: '✊', desc: 'Beat the CPU' },
  { cmd: 'math', name: 'Speed Math', icon: '➗', desc: 'Solve fast' },
  { cmd: 'hangman', name: 'Hangman', icon: '🔤', desc: 'Guess the word' },
  { cmd: '2048', name: '2048 Puzzle', icon: '🔢', desc: 'Merge to 2048' },
  { cmd: 'breakout', name: 'Breakout', icon: '🧱', desc: 'Break all bricks' },
  { cmd: 'car', name: 'Highway Car Racer', icon: '🚗', desc: 'Dodge traffic' },
  { cmd: 'casino', name: 'Casino', icon: '🎰', desc: 'Spin the reels' },
  { cmd: 'connect4', name: 'Connect 4', icon: '🔴', desc: 'Get four in a row' },
  { cmd: 'dino', name: 'Dino Runner', icon: '🦖', desc: 'Jump over obstacles' },
  { cmd: 'doom', name: 'Doom', icon: '👹', desc: 'Clear the arena' },
  { cmd: 'flappy', name: 'Flappy Bird', icon: '🐤', desc: 'Tap to flap' },
  { cmd: 'frogger', name: 'Frogger Highway', icon: '🐸', desc: 'Cross the road' },
  { cmd: 'galaxy', name: 'Galaxy', icon: '🌌', desc: 'Blast invaders' },
  { cmd: 'knifehit', name: 'Knife Hit', icon: '🔪', desc: 'Hit the target' },
  { cmd: 'maze', name: 'Maze Runner', icon: '🌀', desc: 'Find the exit' },
  { cmd: 'memory', name: 'Memory Match', icon: '🧩', desc: 'Find all pairs' },
  { cmd: 'mines', name: 'Minesweeper', icon: '💣', desc: 'Avoid the mines' },
  { cmd: 'pong', name: 'Retro Pong', icon: '🏓', desc: 'Beat the CPU' },
  { cmd: 'quiz', name: 'Quiz', icon: '❓', desc: 'Quick questions' },
  { cmd: 'snake', name: 'Cyber Snake', icon: '🐍', desc: 'Eat, grow, survive' },
  { cmd: 'solars', name: 'Solar System', icon: '🪐', desc: 'Explore the planets' },
  { cmd: 'stack', name: 'Stack', icon: '🧱', desc: 'Build the tower' },
  { cmd: 'tetris', name: 'Tetris Blocks', icon: '🟦', desc: 'Clear the lines' },
  { cmd: 'tictactoe', name: 'Tic-Tac-Toe', icon: '❎', desc: 'Beat the CPU' },
  { cmd: 'whack', name: 'Whack-A-Mole', icon: '🔨', desc: 'Smash the moles' },
  { cmd: 'piano', name: 'Piano', icon: '🎹', desc: 'Play the keys' },
  { cmd: 'race', name: 'Car Race', icon: '🏎️', desc: 'Dodge traffic' },
  { cmd: 'shooter', name: 'Space Shooter', icon: '🚀', desc: 'Blast invaders' },
  { cmd: 'simon', name: 'Simon Says', icon: '🎨', desc: 'Repeat the pattern' },
];

const ALIASES = {
  dinorunner: 'dino',
  dinorun: 'dino',
  flappybird: 'flappy',
  flap: 'flappy',
  mole: 'whack',
  ttt: 'tictactoe',
  connectfour: 'connect4',
  shoot: 'shooter',
};

const BASE_GAME_FILES = {
  dino: 'dino-runner.html',
  flappy: 'flappy-bird.html',
  snake: 'snake.html',
};

function resolveGame(command) {
  const key = String(command || '').trim().toLowerCase();
  const canonical = ALIASES[key] || key;
  return ARCADE_CATALOG.find((g) => g.cmd === canonical) || null;
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gameTemplate(game, pfp = '') {
  const id = JSON.stringify(game.cmd);
  const name = esc(game.name);
  const icon = esc(game.icon);
  const pfpJson = JSON.stringify(pfp || '');

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${icon} ${name}</title><style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:#07101d;color:#edf3ff;font-family:Inter,Segoe UI,system-ui,sans-serif}
body{padding:8px}
.card{width:100%;max-width:760px;margin:0 auto;border:1px solid #243754;border-radius:24px;background:linear-gradient(160deg,#111d31 0%,#0a1321 72%);overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.44)}
.head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px 12px;background:radial-gradient(circle at 0% 0%,rgba(124,92,255,.22),transparent 38%),linear-gradient(135deg,#152440,#0c1727);border-bottom:1px solid #1d2e49}
.brand{display:flex;align-items:center;gap:10px;min-width:0}.logo{width:42px;height:42px;flex:0 0 42px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:#1a2b49;border:1px solid #324769;font-size:23px}.head-copy{min-width:0}.kicker{font-size:9px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase;color:#89a0c6}.title{margin-top:2px;color:#f7f8ff;font-weight:900;letter-spacing:.3px;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{padding:6px 9px;border:1px solid #2a3e61;border-radius:999px;color:#96a9c6;font-size:9px;font-weight:900;letter-spacing:1px;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 14px;background:#0b1626}.stat{min-width:0;border:1px solid #1e324f;border-radius:14px;background:#0e1b2f;padding:9px 8px;text-align:center}.stat small{display:block;color:#778daE;font-size:9px;font-weight:900;letter-spacing:1.2px}.stat b{display:block;margin-top:3px;color:#d0c7ff;font-size:20px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stage{position:relative;min-height:450px;margin:0 12px;padding:14px;border:1px solid #223655;border-radius:18px;background:radial-gradient(circle at 50% 0%,rgba(91,117,170,.1),transparent 44%),#091425;overflow:hidden}.stage:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.025),transparent 24%)}
.controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 12px 0}.btn{min-height:46px;border:1px solid #40558a;border-radius:13px;background:linear-gradient(180deg,#765cf0,#5740c6);color:#fff;font-weight:900;font-size:12px;letter-spacing:.2px;cursor:pointer;box-shadow:0 5px 16px rgba(52,39,120,.26)}.btn.alt{background:#16263e;border-color:#2d456a}.btn:active{transform:scale(.985);filter:brightness(1.05)}.btn:focus-visible,.cell:focus-visible,.key:focus-visible,.answer:focus-visible{outline:3px solid rgba(157,136,255,.55);outline-offset:2px}
.grid{display:grid;gap:7px}.cell{background:#122139;border:1px solid #2a4367;border-radius:10px;min-height:48px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#eff4ff;cursor:pointer}.cell:active{transform:scale(.97);background:#1b2f4c}.msg{margin:10px 13px 0;padding:10px 12px;border:1px solid #1e314e;border-radius:12px;text-align:center;color:#9aacc6;background:#0b1729;font-size:11px;line-height:1.35}.ok{color:#7df0ae;border-color:#24553e}.bad{color:#ff8e9b;border-color:#5d2932}.canvas{display:block;width:100%;height:auto;min-height:360px;background:#07101f;border-radius:14px;border:1px solid #2a4163}.big{font-size:42px;font-weight:900;text-align:center;padding:70px 8px}.question{font-size:20px;font-weight:900;line-height:1.3;text-align:center;min-height:72px;padding:18px 8px}.answers{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}.answer{min-height:54px;background:#12223a;border:1px solid #345070;border-radius:13px;padding:12px;color:#eef4ff;font-weight:800;cursor:pointer}.answer:active{transform:scale(.985)}.pill{display:inline-block;padding:5px 9px;border:1px solid #344b70;border-radius:999px;color:#aabbd4;font-size:10px;margin:2px}.key{background:#edf3fb;color:#101a2b;border-radius:10px;border:1px solid #c8d4e4;height:54px;font-weight:900;font-size:16px;cursor:pointer}.keys{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.key:disabled{opacity:.35}.hidden{display:none!important}.world{height:390px;position:relative;background:radial-gradient(circle at 50% 45%,#273762,#070e1c 68%);border-radius:14px;overflow:hidden}.planet{position:absolute;border-radius:50%;box-shadow:0 0 24px rgba(255,255,255,.14)}
.launch{min-height:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;background:radial-gradient(circle at 50% 20%,rgba(125,92,255,.15),transparent 40%)}.launch-icon{width:86px;height:86px;display:flex;align-items:center;justify-content:center;border-radius:26px;background:#142440;border:1px solid #30486d;font-size:48px;box-shadow:0 12px 28px rgba(0,0,0,.25)}.launch-kicker{margin-top:16px;color:#879abd;font-size:10px;font-weight:900;letter-spacing:2px}.launch-title{margin-top:4px;color:#fff;font-size:28px;font-weight:900}.launch-sub{margin:7px auto 18px;color:#9badc7;max-width:410px;font-size:12px;line-height:1.45}.launch .btn{width:min(100%,300px);min-height:52px;font-size:14px}
@media(max-width:520px){.head{padding:13px}.badge{display:none}.stats{gap:6px;padding:10px}.stat{padding:8px 6px}.stat b{font-size:18px}.stage{min-height:390px;margin:0 8px;padding:10px}.canvas{min-height:0}.controls{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px 8px 0}.btn{min-height:46px}.cell{min-height:44px}.question{font-size:17px}.keys{gap:4px}.key{height:46px;font-size:14px}.launch{min-height:360px}.launch-title{font-size:24px}}
@media(max-width:350px){.controls{grid-template-columns:1fr}.answers{grid-template-columns:1fr}.game-item{grid-template-columns:36px minmax(0,1fr)}.game-item .game-icon{width:36px;height:36px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}.btn:active,.cell:active,.answer:active{transform:none}}
</style></head><body><div class="card"><div class="head"><div class="brand"><div class="logo">${icon}</div><div class="head-copy"><div class="kicker">ABIX HTML ARCADE</div><div class="title">${name}</div></div></div><div class="badge">IN-CHAT GAME</div></div><div class="stats"><div class="stat"><small>SCORE</small><b id="score">0</b></div><div class="stat"><small>BEST</small><b id="best">0</b></div><div class="stat"><small>STATUS</small><b id="status">READY</b></div></div><div id="stage" class="stage"><div class="launch" id="launch"><div class="launch-icon">${icon}</div><div class="launch-kicker">READY TO PLAY</div><div class="launch-title">${name}</div><div class="launch-sub">Large HTML game view • touch friendly controls • no extra command menu needed.</div><button type="button" id="startBtn" class="btn">▶ PLAY NOW</button></div></div><div id="controls" class="controls"></div><div id="msg" class="msg" aria-live="polite">Tap <strong>PLAY NOW</strong> to start.</div></div><script>(function(){'use strict';const GAME=${id},PFP=${pfpJson},$=id=>document.getElementById(id),stage=$('stage'),controls=$('controls'),msg=$('msg'),launch=$('launch'),startBtn=$('startBtn');function storageGet(key,fallback='0'){try{const v=window.localStorage.getItem(key);return v==null?fallback:v}catch(_){return fallback}}function storageSet(key,value){try{window.localStorage.setItem(key,String(value))}catch(_){}}let score=0,best=Number(storageGet('arcade_'+GAME)||0);$('best').textContent=best;function stat(n){score=Math.max(0,Math.floor(n));$('score').textContent=score;if(score>best){best=score;storageSet('arcade_'+GAME,best);$('best').textContent=best}}function status(v){$('status').textContent=String(v||'READY')}function button(label,fn,cls='btn'){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',fn);return b}function controlsFor(items){controls.innerHTML='';items.forEach(x=>controls.appendChild(button(x[0],x[1],x[2]||'btn')))}function say(t,good=false){msg.innerHTML=t;msg.className='msg '+(good?'ok':'')}function shuffle(a){return a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1])}
function quiz(mode){const qs=mode==='math'?[['7 × 8 = ?',['54','56','64','48'],'56'],['15 + 27 = ?',['40','42','44','52'],'42'],['81 ÷ 9 = ?',['7','8','9','10'],'9'],['12 × 12 = ?',['124','144','132','156'],'144']]:[['Capital of Pakistan?',['Lahore','Karachi','Islamabad','Peshawar'],'Islamabad'],['Red Planet?',['Venus','Mars','Jupiter','Mercury'],'Mars'],['Largest ocean?',['Atlantic','Indian','Pacific','Arctic'],'Pacific'],['2+2×3 = ?',['8','10','12','6'],'8']];let q=qs[Math.floor(Math.random()*qs.length)];stage.innerHTML='<div class="question" id="q"></div><div class="answers" id="a"></div>';function next(){q=qs[Math.floor(Math.random()*qs.length)];$('q').textContent=q[0];const a=$('a');a.innerHTML='';shuffle(q[1]).forEach(v=>{const b=document.createElement('button');b.className='answer';b.textContent=v;b.onclick=()=>{if(v===q[2]){stat(score+10);say('✅ Correct!',true);setTimeout(next,350)}else say('❌ Wrong')};a.appendChild(b)})}controlsFor([['NEW QUESTION',next]]);next();status('PLAY')} 
function rps(){stage.innerHTML='<div class="big">✊ ✋ ✌️</div>';controlsFor([['✊ ROCK',()=>play('rock')],['✋ PAPER',()=>play('paper')],['✌️ SCISSORS',()=>play('scissors')]]);function play(me){const cpu=shuffle(['rock','paper','scissors'])[0];const win=(me==='rock'&&cpu==='scissors')||(me==='paper'&&cpu==='rock')||(me==='scissors'&&cpu==='paper');const draw=me===cpu;if(win){stat(score+10);say('✅ You win! CPU: '+cpu,true)}else if(draw)say('🤝 Draw — CPU: '+cpu);else{stat(Math.max(0,score-2));say('❌ CPU wins — '+cpu)}status('PLAY')}} 
function wyr(){const qs=[['Would you rather fly or become invisible?','🪽 Fly','👻 Invisible'],['Would you rather time travel to the past or future?','⏳ Past','🚀 Future'],['Would you rather be super fast or super strong?','⚡ Fast','💪 Strong']];let q=qs[Math.floor(Math.random()*qs.length)];stage.innerHTML='<div class="question">'+q[0]+'</div>';controlsFor([[q[1],()=>vote(q[1])],[q[2],()=>vote(q[2])],['NEXT',next]]);function vote(v){stat(score+1);say('You chose '+v,true)}function next(){q=qs[Math.floor(Math.random()*qs.length)];stage.querySelector('.question').textContent=q[0];controls.firstChild.textContent=q[1];controls.firstChild.onclick=()=>vote(q[1]);controls.children[1].textContent=q[2];controls.children[1].onclick=()=>vote(q[2]);say('Choose one')}} 
function ttt(){let b=Array(9).fill(''),turn='X',done=false;stage.innerHTML='<div id="tt" class="grid" style="grid-template-columns:repeat(3,1fr)"></div>';const g=$('tt');function draw(){g.innerHTML='';b.forEach((v,i)=>{const c=document.createElement('button');c.className='cell';c.textContent=v;c.onclick=()=>move(i);g.appendChild(c)});const w=win();if(w||b.every(Boolean)){done=true;status(w==='X'?'WIN':w==='O'?'LOSE':'DRAW');say(w?'🏆 '+w+' wins':'🤝 Draw',!!w)}}function win(){for(const x of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[x[0]]&&b[x[0]]===b[x[1]]&&b[x[1]]===b[x[2]])return b[x[0]];return ''}function move(i){if(done||b[i])return;b[i]=turn;draw();if(!done){turn='O';setTimeout(()=>{const opts=b.map((v,j)=>v?null:j).filter(v=>v!==null);if(!opts.length)return;b[opts[Math.floor(Math.random()*opts.length)]]='O';turn='X';draw()},250)}}controlsFor([['RESTART',()=>ttt()]]);status('PLAY');draw()} 
function connect4(){let a=Array.from({length:42},()=>''),turn='R',done=false;stage.innerHTML='<div id="c4" class="grid" style="grid-template-columns:repeat(7,1fr)"></div>';const g=$('c4');function draw(){g.innerHTML='';for(let i=0;i<42;i++){const c=button(a[i]||'·',()=>drop(i%7),'cell');c.style.color=a[i]==='R'?'#ff5c7a':'#5aa9ff';g.appendChild(c)}}function drop(col){if(done)return;for(let r=5;r>=0;r--){const i=r*7+col;if(!a[i]){a[i]=turn;break}}check();if(!done){turn=turn==='R'?'B':'R';if(turn==='B')setTimeout(()=>{drop(Math.floor(Math.random()*7));turn='R'},180)}draw()}function check(){for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const [dr,dc]of[[1,0],[0,1],[1,1],[1,-1]]){const i=r*7+c,j1=r+dr,k1=c+dc,j2=r+2*dr,k2=c+2*dc,j3=r+3*dr,k3=c+3*dc;if(j3<0||j3>=6||k3<0||k3>=7)continue;if(a[i]&&a[i]===a[j1*7+k1]&&a[i]===a[j2*7+k2]&&a[i]===a[j3*7+k3]){done=true;status(a[i]==='R'?'WIN':'LOSE');say(a[i]==='R'?'🏆 Connect!':'❌ CPU wins');return}}}controlsFor([['RESTART',()=>connect4()]]);draw();status('PLAY')}
function hangman(){const words=['JAVASCRIPT','COMPUTER','PAKISTAN','SOFTWARE','WHATSAPP'];const word=words[Math.floor(Math.random()*words.length)];let used=new Set(),bad=0;stage.innerHTML='<div class="big" id="word"></div><div id="letters" class="keys"></div>';const wd=$('word'),ls=$('letters');function draw(){wd.textContent=[...word].map(c=>used.has(c)?c:'_').join(' ');ls.innerHTML='';'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(c=>{const k=button(c,()=>pick(c),'key');if(used.has(c))k.disabled=true;ls.appendChild(k)});if([...word].every(c=>used.has(c))){stat(score+25);status('WIN');say('🎉 Word solved!',true)}if(bad>=6){status('OVER');say('💀 Word was '+word)}}function pick(c){if(used.has(c)||bad>=6)return;used.add(c);if(!word.includes(c)){bad++;say('Wrong: '+bad+'/6')}draw()}controlsFor([['NEW WORD',()=>hangman()]]);draw();status('PLAY')} 
function memory(){const vals=shuffle(['🍎','🍎','🚀','🚀','🎮','🎮','🐍','🐍','⭐','⭐','🌙','🌙']);let open=[];let matched=0;stage.innerHTML='<div id="mem" class="grid" style="grid-template-columns:repeat(4,1fr)"></div>';const g=$('mem');function draw(){g.innerHTML='';vals.forEach((v,i)=>{const c=button(open.includes(i)||done.has(i)?v:'❓',()=>flip(i),'cell');g.appendChild(c)})}let done=new Set();function flip(i){if(done.has(i)||open.includes(i)||open.length===2)return;open.push(i);draw();if(open.length===2){if(vals[open[0]]===vals[open[1]]){done.add(open[0]);done.add(open[1]);open=[];matched+=2;stat(score+5);if(done.size===vals.length){status('WIN');say('🧠 All matched!',true)}draw()}else setTimeout(()=>{open=[];draw()},400)}}controlsFor([['RESTART',()=>memory()]]);status('PLAY');draw()} 
function casino(){stage.innerHTML='<div class="big" id="reels">🍒 | 🍋 | 💎</div>';controlsFor([['🎰 SPIN',spin]]);function spin(){const s=shuffle(['🍒','🍋','7️⃣','💎','⭐']);const out=[s[0],s[1],s[2]];$('reels').textContent=out.join(' | ');if(out[0]===out[1]&&out[1]===out[2]){stat(score+50);say('🎉 JACKPOT!',true)}else if(out[0]===out[1]||out[1]===out[2]||out[0]===out[2]){stat(score+10);say('✨ Pair!')}else say('No win — spin again')}} 
function whack(){stage.innerHTML='<div id="holes" class="grid" style="grid-template-columns:repeat(3,1fr)"></div>';const g=$('holes');let active=-1,left=20,timer;function tick(){if(left<=0){clearInterval(timer);status('DONE');say('Time up — Score '+score);return}left--;active=Math.floor(Math.random()*9);g.innerHTML='';for(let i=0;i<9;i++){g.appendChild(button(i===active?'🐹':'🕳️',()=>{if(i===active){stat(score+1);active=-1}} ,'cell'))}}controlsFor([['START',()=>{score=0;stat(0);left=20;clearInterval(timer);timer=setInterval(tick,650);tick();status('PLAY')}]]);tick();status('READY')} 
function piano(){stage.innerHTML='<div class="keys" style="grid-template-columns:repeat(7,1fr)"></div>';const g=stage.firstChild;[262,294,330,349,392,440,494].forEach((f,i)=>{const k=button(['C','D','E','F','G','A','B'][i],()=>{try{const a=new (AudioContext||webkitAudioContext)(),o=a.createOscillator(),gg=a.createGain();o.frequency.value=f;o.connect(gg);gg.connect(a.destination);gg.gain.value=.07;o.start();o.stop(a.currentTime+.18)}catch{}stat(score+1)},'key');g.appendChild(k)});status('PLAY');say('Tap the keys 🎹')} 
function simon(){const colors=['🟥','🟩','🟦','🟨'];let seq=[],user=0,locked=true;stage.innerHTML='<div id="simon" class="grid" style="grid-template-columns:1fr 1fr"></div>';const g=$('simon');colors.forEach((c,i)=>g.appendChild(button(c,()=>press(i),'cell')));function next(){seq.push(Math.floor(Math.random()*4));user=0;locked=true;say('Watch...');let i=0;const t=setInterval(()=>{g.children[seq[i]].style.transform='scale(.9)';setTimeout(()=>g.children[seq[i]].style.transform='',170);i++;if(i>=seq.length){clearInterval(t);locked=false;say('Your turn')}} ,320)}function press(i){if(locked)return;if(seq[user]!==i){say('❌ Wrong pattern');status('OVER');return}user++;if(user===seq.length){stat(score+10);next()}}controlsFor([['START',()=>{seq=[];score=0;stat(0);next();status('PLAY')}]]);status('READY')} 
function stack(){stage.innerHTML='<canvas id="cv" class="canvas" width="520" height="280"></canvas>';const c=$('cv'),x=c.getContext('2d');let w=160,h=24,xp=180,y=250,dir=1,blocks=[],running=false,timer;function draw(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#9a74ff';x.fillRect(xp,y,w,h);blocks.forEach(b=>x.fillRect(b.x,b.y,b.w,h));}function drop(){if(!running){running=true;status('PLAY');timer=setInterval(()=>{xp+=dir*4;if(xp<=0||xp+w>=c.width)dir*=-1;draw()},30);return}clearInterval(timer);let prev=blocks.at(-1)||{x:180,y:250,w:160},over=Math.max(0,Math.min(xp+w,prev.x+prev.w)-Math.max(xp,prev.x));if(over<25){status('OVER');say('Tower fell');running=false;return}w=over;xp=Math.max(xp,prev.x);blocks.push({x:xp,y:y,w});y-=h;if(y<10){stat(score+1);y=250;blocks=[]}draw()}controlsFor([['DROP / START',drop],['RESET',()=>stack()]]);draw()} 
function car(){stage.innerHTML='<canvas id="cv" class="canvas" width="520" height="300"></canvas>';const c=$('cv'),x=c.getContext('2d');let lane=1,obs=[],run=true,frame=0,timer;function draw(){x.fillStyle='#0b1020';x.fillRect(0,0,c.width,c.height);x.fillStyle='#20283b';x.fillRect(80,0,360,c.height);x.strokeStyle='#ffffff33';x.setLineDash([18,18]);x.beginPath();x.moveTo(200,0);x.lineTo(200,c.height);x.moveTo(320,0);x.lineTo(320,c.height);x.stroke();x.setLineDash([]);const px=135+lane*120;x.fillStyle='#57c7ff';x.fillRect(px,250,60,34);obs.forEach(o=>{x.fillStyle='#ff5d73';x.fillRect(135+o.l*120,o.y,60,34)})}function step(){frame++;obs.forEach(o=>o.y+=5);if(frame%35===0)obs.push({l:Math.floor(Math.random()*3),y:-40});obs=obs.filter(o=>o.y<320);const hit=obs.some(o=>o.l===lane&&o.y>225);if(hit){run=false;clearInterval(timer);status('OVER');say('🚗 Crash! Score '+score);return}stat(score+1);draw()}controlsFor([['⬅️ LEFT',()=>{lane=Math.max(0,lane-1)}],['➡️ RIGHT',()=>{lane=Math.min(2,lane+1)}],['RESTART',()=>car()]]);timer=setInterval(step,120);status('PLAY');draw()} 
function canvasArena(kind){stage.innerHTML='<canvas id="cv" class="canvas" width="520" height="280"></canvas>';const c=$('cv'),x=c.getContext('2d');let px=240,shots=[],enemies=[],timer,frame=0;function draw(){x.fillStyle='#080d1c';x.fillRect(0,0,c.width,c.height);x.fillStyle='#64d4ff';x.fillRect(px,240,38,24);x.fillStyle='#ff5e7b';enemies.forEach(e=>x.fillRect(e.x,e.y,26,20));x.fillStyle='#ffe66d';shots.forEach(s=>x.fillRect(s.x,s.y,5,12));if(kind==='doom'){x.fillStyle='#ffb020';x.font='22px sans-serif';x.fillText('👹',px+5,232)}}function step(){frame++;if(frame%22===0)enemies.push({x:Math.random()*494,y:10});shots.forEach(s=>s.y-=8);enemies.forEach(e=>e.y+=2);for(let i=shots.length-1;i>=0;i--){for(let j=enemies.length-1;j>=0;j--)if(shots[i].x<enemies[j].x+26&&shots[i].x+5>enemies[j].x&&shots[i].y<enemies[j].y+20){enemies.splice(j,1);shots.splice(i,1);stat(score+5);break}}if(enemies.some(e=>e.y>225)){clearInterval(timer);status('OVER');say('💥 Game over');return}draw()}function fire(){shots.push({x:px+16,y:230})}controlsFor([['⬅️',()=>px=Math.max(0,px-24)],['🔥 FIRE',fire],['➡️',()=>px=Math.min(482,px+24)],['RESTART',()=>canvasArena(kind)]]);timer=setInterval(step,70);status('PLAY');draw()} 
function breakout(){stage.innerHTML='<canvas id="cv" class="canvas" width="520" height="280"></canvas>';const c=$('cv'),x=c.getContext('2d');let ball={x:260,y:220,vx:3,vy:-3},p=220,br=[];for(let r=0;r<4;r++)for(let q=0;q<8;q++)br.push({x:20+q*62,y:20+r*24,alive:true});function step(){x.fillStyle='#080d1c';x.fillRect(0,0,520,280);x.fillStyle='#b47cff';br.forEach(b=>b.alive&&x.fillRect(b.x,b.y,54,18));x.fillStyle='#62d6ff';x.fillRect(p,254,80,10);x.fillStyle='#ffe66d';x.beginPath();x.arc(ball.x,ball.y,6,0,7);x.fill();ball.x+=ball.vx;ball.y+=ball.vy;if(ball.x<6||ball.x>514)ball.vx*=-1;if(ball.y<6)ball.vy*=-1;if(ball.y>244&&ball.x>p&&ball.x<p+80)ball.vy=-Math.abs(ball.vy);for(const b of br)if(b.alive&&ball.x>b.x&&ball.x<b.x+54&&ball.y>b.y&&ball.y<b.y+18){b.alive=false;ball.vy*=-1;stat(score+1);break}if(ball.y>286){clearInterval(timer);status('OVER');say('Breakout over')}if(br.every(b=>!b.alive)){clearInterval(timer);status('WIN');say('🏆 Bricks cleared!',true)}}controlsFor([['⬅️ LEFT',()=>p=Math.max(0,p-25)],['➡️ RIGHT',()=>p=Math.min(440,p+25)],['RESTART',()=>breakout()]]);const timer=setInterval(step,30);status('PLAY')} 
function pong(){stage.innerHTML='<canvas id="cv" class="canvas" width="520" height="280"></canvas>';const c=$('cv'),x=c.getContext('2d');let py=110,ball={x:260,y:140,vx:3,vy:2},cpu=110,timer;function step(){x.fillStyle='#080d1c';x.fillRect(0,0,520,280);x.fillStyle='#7f7cff';x.fillRect(10,py,10,60);x.fillStyle='#ff7bd8';x.fillRect(500,cpu,10,60);x.fillStyle='#ffe66d';x.beginPath();x.arc(ball.x,ball.y,7,0,7);x.fill();ball.x+=ball.vx;ball.y+=ball.vy;if(ball.y<7||ball.y>273)ball.vy*=-1;cpu+=ball.y<cpu+30?-2:2;if(ball.x<20&&ball.y>py&&ball.y<py+60)ball.vx=Math.abs(ball.vx);if(ball.x>495&&ball.y>cpu&&ball.y<cpu+60)ball.vx=-Math.abs(ball.vx);if(ball.x<0||ball.x>520){if(ball.x>520)stat(score+1);else score=Math.max(0,score-1);ball={x:260,y:140,vx:ball.x>520?-3:3,vy:2}}draw()}function draw(){ }controlsFor([['⬆️ UP',()=>py=Math.max(0,py-30)],['⬇️ DOWN',()=>py=Math.min(220,py+30)],['RESTART',()=>pong()]]);timer=setInterval(step,30);status('PLAY')} 
function frogger(){let x=2,y=5;stage.innerHTML='<div id="frog" class="grid" style="grid-template-columns:repeat(5,1fr)"></div>';const g=$('frog');function draw(){g.innerHTML='';for(let r=0;r<6;r++)for(let c=0;c<5;c++){let v=r===y&&c===x?'🐸':(r===0?'🏁':(r%2?'🚗':'🌊'));g.appendChild(button(v,()=>move(c,r),'cell'))}}function move(c,r){if(Math.abs(c-x)+Math.abs(r-y)!==1)return;x=c;y=r;if(y===0){stat(score+20);y=5;x=2;say('🎉 Safe crossing!',true)}draw()}controlsFor([['⬆️ UP',()=>move(x,y-1)],['⬅️ LEFT',()=>move(x-1,y)],['➡️ RIGHT',()=>move(x+1,y)],['⬇️ DOWN',()=>move(x,y+1)]]);draw();status('PLAY')} 
function maze(){const m=['1111111','1000001','1011101','1010101','1010101','1000001','1111111'].map(r=>r.split(''));let p=[1,1];stage.innerHTML='<div id="mz" class="grid" style="grid-template-columns:repeat(7,1fr)"></div>';const g=$('mz');function draw(){g.innerHTML='';for(let r=0;r<7;r++)for(let c=0;c<7;c++)g.appendChild(button(r===p[1]&&c===p[0]?'🙂':m[r][c]==='1'?'⬛':'⬜',()=>move(c,r),'cell'));}function move(c,r){if(c<0||r<0||c>6||r>6||m[r][c]==='1')return;p=[c,r];if(p[0]===5&&p[1]===5){stat(score+25);say('🏁 Maze solved!',true)}draw()}controlsFor([['⬆️',()=>move(p[0],p[1]-1)],['⬇️',()=>move(p[0],p[1]+1)],['⬅️',()=>move(p[0]-1,p[1])],['➡️',()=>move(p[0]+1,p[1])],['RESTART',()=>maze()]]);draw();status('PLAY')} 
function mines(){const n=36,mines=new Set(shuffle([...Array(n).keys()]).slice(0,6)),open=new Set();stage.innerHTML='<div id="ms" class="grid" style="grid-template-columns:repeat(6,1fr)"></div>';const g=$('ms');function draw(){g.innerHTML='';for(let i=0;i<n;i++)g.appendChild(button(open.has(i)?(mines.has(i)?'💣':'◻️'):'❔',()=>pick(i),'cell'))}function pick(i){if(open.has(i))return;if(mines.has(i)){open.add(i);draw();status('OVER');say('💥 Mine hit')}else{open.add(i);stat(score+1);if(open.size>=n-mines.size){status('WIN');say('💎 Cleared!',true)}draw()}}controlsFor([['RESTART',()=>mines()]]);draw();status('PLAY')} 
function solar(){stage.innerHTML='<div class="world"><div class="planet" style="width:60px;height:60px;background:#ffd54d;left:calc(50% - 30px);top:calc(50% - 30px)"></div><div id="orb1" class="planet" style="width:16px;height:16px;background:#8ec5ff"></div><div id="orb2" class="planet" style="width:22px;height:22px;background:#f7a563"></div><div id="orb3" class="planet" style="width:28px;height:28px;background:#6ee7a0"></div></div>';let t=0;const timer=setInterval(()=>{t+=.02;const els=[[$('orb1'),80,1],[$('orb2'),118,.7],[$('orb3'),155,.45]];els.forEach(([e,r,s])=>{e.style.left='calc(50% + '+(Math.cos(t*s)*r)+'px)';e.style.top='calc(50% + '+(Math.sin(t*s)*r)+'px)'})},40);controlsFor([['SCORE',()=>{stat(score+1);say('☀️ Solar System explored!',true)}]]);window.addEventListener('beforeunload',()=>clearInterval(timer));status('EXPLORE')} 
function knife(){let angle=0,count=0,target=0;stage.innerHTML='<div class="big">🎯</div>';controlsFor([['🔪 THROW',()=>{angle=(angle+30)%360;count++;const hit=Math.abs(angle%60-target)<25;if(hit){stat(score+10);target=(target+60)%360;say('🎯 Hit!',true)}else say('❌ Miss')}]]);status('PLAY')} 
function tetr(){let blocks=0;stage.innerHTML='<div class="grid" style="grid-template-columns:repeat(10,1fr)" id="te"></div>';const g=$('te');function draw(){g.innerHTML='';for(let i=0;i<200;i++)g.appendChild(button(i>=190-blocks?'🟦':'⬛',()=>{if(blocks<100)blocks++;draw();stat(score+1)},'cell'))}controlsFor([['DROP',()=>{blocks=Math.min(100,blocks+10);stat(score+2);draw()}],['RESTART',()=>tetr()]]);draw();status('PLAY')} 
function two048(){let a=Array(16).fill(0);function add(){const z=a.map((v,i)=>v?null:i).filter(v=>v!==null);if(z.length)a[z[Math.floor(Math.random()*z.length)]]=Math.random()<.9?2:4}function draw(){stage.innerHTML='<div id="g2048" class="grid" style="grid-template-columns:repeat(4,1fr)"></div>';const g=$("g2048");a.forEach(v=>{const c=button(v||"",()=>{},"cell");c.style.fontWeight='900';g.appendChild(c)})}function slide(line){const vals=line.filter(Boolean);const out=[];for(let i=0;i<vals.length;i++){if(vals[i]===vals[i+1]){out.push(vals[i]*2);i++;stat(score+vals[i]*2)}else out.push(vals[i])}while(out.length<4)out.push(0);return out}function move(dx,dy){let changed=false;if(dy===0){for(let r=0;r<4;r++){let row=a.slice(r*4,r*4+4);let rev=dx>0;let src=rev?row.reverse():row;let out=slide(src);if(rev)out.reverse();for(let c=0;c<4;c++){const v=out[c];if(a[r*4+c]!==v)changed=true;a[r*4+c]=v}}}else{for(let c=0;c<4;c++){let col=[];for(let r=0;r<4;r++)col.push(a[r*4+c]);let rev=dy>0;let src=rev?col.reverse():col;let out=slide(src);if(rev)out.reverse();for(let r=0;r<4;r++){const v=out[r];if(a[r*4+c]!==v)changed=true;a[r*4+c]=v}}}if(changed)add();draw()}controlsFor([['⬅️',()=>move(-1,0)],['➡️',()=>move(1,0)],['⬆️',()=>move(0,-1)],['⬇️',()=>move(0,1)],['RESTART',()=>two048()]]);a[Math.floor(Math.random()*16)]=2;add();draw();status('PLAY')} 
function tgame(id){if(id==='tetris')tetr();else if(id==='2048')two048();else if(id==='breakout')breakout();else if(id==='pong')pong();else if(id==='car'||id==='race')car();else if(id==='frogger')frogger();else if(id==='maze')maze();else if(id==='mines')mines();else if(id==='connect4')connect4();else if(id==='tictactoe')ttt();else if(id==='hangman')hangman();else if(id==='memory')memory();else if(id==='whack')whack();else if(id==='piano')piano();else if(id==='simon')simon();else if(id==='knifehit')knife();else if(id==='stack')stack();else if(id==='solars')solar();else if(id==='galaxy'||id==='shooter'||id==='doom')canvasArena(id);else if(id==='rps')rps();else if(id==='wyr')wyr();else if(id==='math')quiz('math');else if(id==='quiz'||id==='trivia')quiz('quiz');else if(id==='casino')casino();else quiz('quiz')}function launchGame(){if(!launch)return;launch.classList.add('hidden');msg.textContent='Game started. Use the controls below.';try{tgame(GAME)}catch(err){status('ERROR');msg.textContent='Unable to start this game.';console.error(err)}}function safeLaunch(e){if(e){try{e.preventDefault()}catch(_){}}launchGame()}startBtn.addEventListener('click',safeLaunch);startBtn.addEventListener('pointerup',safeLaunch);startBtn.addEventListener('touchend',safeLaunch,{passive:false});})();</script></body></html>`;
}

function buildGameMenuHtml(prefix = '-') {
  const p = String(prefix || '-');
  const groups = [
    ['⚡ ACTION', ['dino','flappy','frogger','car','race','shooter','doom','galaxy','knifehit','whack','pong','breakout']],
    ['🧠 PUZZLE', ['2048','tetris','connect4','tictactoe','mines','maze','memory','hangman','stack']],
    ['🎯 CASUAL', ['trivia','wyr','rps','math','quiz','casino','piano','simon','snake','solars']],
  ];
  const byCmd = Object.fromEntries(ARCADE_CATALOG.map(g => [g.cmd, g]));
  const cards = groups.map(([label, cmds]) => {
    const items = cmds.map(cmd => {
      const g = byCmd[cmd];
      if (!g) return '';
      return `<a class="game-item" href="/games/${encodeURIComponent(g.cmd)}" data-cmd="${esc(g.cmd)}" aria-label="${esc(g.name)} ${esc(p + g.cmd)}"><span class="game-icon">${esc(g.icon)}</span><span class="game-copy"><strong>${esc(g.name)}</strong><small>${esc(g.desc)}</small></span><code>${esc(p + g.cmd)}</code></a>`;
    }).join('');
    return `<section class="game-group"><div class="group-title"><span>${esc(label)}</span><span class="group-count">${cmds.length}</span></div><div class="game-grid">${items}</div></section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>ABIX Game Menu</title><style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:#07111f;color:#edf3ff;font-family:Inter,Segoe UI,system-ui,sans-serif}
body{padding:8px}
.shell{width:100%;max-width:760px;margin:0 auto;border:1px solid #20314d;border-radius:24px;background:linear-gradient(160deg,#101b2e,#091321 70%);overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.hero{padding:20px 18px 16px;background:radial-gradient(circle at 15% 0%,rgba(126,92,255,.26),transparent 34%),linear-gradient(135deg,#132340,#0b1424)}
.kicker{font-size:10px;font-weight:900;letter-spacing:2px;color:#9fb3d8;text-transform:uppercase}
.hero h1{margin:4px 0 6px;font-size:28px;line-height:1.05;letter-spacing:-.5px}
.hero p{margin:0;color:#9fb0c9;font-size:12px;line-height:1.5}
.toolbar{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #182944;border-bottom:1px solid #182944;background:#0b1627}
.search{flex:1;min-width:0;height:44px;border:1px solid #2a3d5f;border-radius:13px;background:#0e1b2f;color:#eef4ff;padding:0 13px;font-size:15px;outline:none}
.search:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.15)}
.count{display:flex;align-items:center;justify-content:center;min-width:92px;padding:0 12px;border:1px solid #2a3d5f;border-radius:13px;color:#aab9d0;font-size:11px;font-weight:800}
.content{padding:12px 14px 16px}
.game-group{margin-top:12px}.game-group:first-child{margin-top:0}
.group-title{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px;color:#9fb3d8;font-size:10px;font-weight:900;letter-spacing:1.5px}
.group-count{padding:3px 7px;border:1px solid #2a3d5f;border-radius:999px;color:#7387a8;font-size:9px}
.game-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.game-item{min-width:0;min-height:72px;display:grid;grid-template-columns:42px minmax(0,1fr);grid-template-rows:1fr auto;gap:0 10px;text-align:left;padding:10px;border:1px solid #223653;border-radius:16px;background:linear-gradient(180deg,#111f34,#0d192b);color:#f5f8ff;cursor:pointer}
.game-item:active{transform:scale(.985);border-color:#7659ee;background:#16233c}
.game-item .game-icon{grid-row:1 / span 2;display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:13px;background:#172742;font-size:23px}
.game-copy{display:flex;flex-direction:column;min-width:0}.game-copy strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.game-copy small{margin-top:3px;color:#8395b2;font-size:9px;line-height:1.25}
.game-item code{grid-column:2;margin-top:7px;color:#bdafff;font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pickbar{margin-top:12px;padding:12px 13px;border:1px solid #263958;border-radius:16px;background:#0d1a2d;color:#9fb0c9;font-size:11px}
.pickbar b{color:#f0f4ff}.command{display:inline-block;margin-left:5px;color:#d3c8ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:900}
.footer{padding:12px 14px;color:#657898;font-size:9px;text-align:center;border-top:1px solid #182944}
.empty{display:none;padding:30px 14px;color:#8091ad;text-align:center}
@media(max-width:480px){.game-grid{grid-template-columns:1fr}.hero h1{font-size:24px}.game-item{min-height:68px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.game-item{transition:none!important}}
</style></head><body><main class="shell"><header class="hero"><div class="kicker">ABIX ARCADE • HTML GAME MENU</div><h1>🎮 31 Games</h1><p>Choose a game below. The menu is rendered as HTML and each card shows the exact chat command.</p></header><div class="toolbar"><input id="search" class="search" type="search" placeholder="Search games…" aria-label="Search games"><div id="count" class="count">31 available</div></div><div id="content" class="content">${cards}<div id="empty" class="empty">No games match your search.</div><div class="pickbar" aria-live="polite">Selected: <b id="picked">None</b><span id="command" class="command"></span></div></div><footer class="footer">Tap a card to launch the browser game, or use the displayed command in WhatsApp.</footer></main><script>(function(){'use strict';const root=document.querySelector('.shell');if(!root)return;const search=document.getElementById('search'),count=document.getElementById('count'),empty=document.getElementById('empty'),picked=document.getElementById('picked'),command=document.getElementById('command');const items=[...root.querySelectorAll('.game-item')];const groups=[...root.querySelectorAll('.game-group')];function refresh(){const q=String(search.value||'').trim().toLowerCase();let visible=0;items.forEach(item=>{const text=item.innerText.toLowerCase();const show=!q||text.includes(q);item.style.display=show?'grid':'none';if(show)visible++;});groups.forEach(group=>{group.style.display=[...group.querySelectorAll('.game-item')].some(i=>i.style.display!=='none')?'block':'none'});count.textContent=visible+' available';empty.style.display=visible?'none':'block'}items.forEach(item=>item.addEventListener('click',()=>{items.forEach(i=>i.removeAttribute('data-selected'));item.setAttribute('data-selected','1');picked.textContent=item.querySelector('strong')?.textContent||'Game';command.textContent=item.querySelector('code')?.textContent||'';}));search.addEventListener('input',refresh);refresh();})();</script></body></html>`;
}

function personalizedHtml(game, pfp = '') {
  const file = BASE_GAME_FILES[game.cmd];
  if (!file) return null;
  const filePath = path.join(GAMES_DIR, file);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8').split('{{PFP}}').join(pfp || '');
}

async function getPfpDataUri(sock, jid) {
  try {
    if (!jid || typeof sock?.profilePictureUrl !== 'function' || typeof fetch !== 'function') return '';
    const url = await sock.profilePictureUrl(jid, 'image');
    if (!url) return '';
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 16000) return '';
    return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

module.exports = {
  ARCADE_CATALOG,
  ALIASES,
  resolveGame,
  gameTemplate,
  buildGameMenuHtml,
  personalizedHtml,
  getPfpDataUri,
};
