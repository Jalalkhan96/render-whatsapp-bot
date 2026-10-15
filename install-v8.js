const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BACKUP = path.join(ROOT, `.abix-social-v8-backup-${Date.now()}`);
const TARGET_DIR = path.join(ROOT, 'plugins2');
const PAYLOAD = path.join(__dirname, 'payload', 'plugins2');
const SUPPORT = path.join(__dirname, 'lib');
const APIFY = path.join(__dirname, 'apify-rotator-kit');

const COMMANDS = new Set([
  'slidermenu','slider','smenu','ttsearch','tts','tiktoksearch','igsearch','igs','instagramsearch',
  'fbsearch','fbs','facebooksearch','redditsearch','rdsearch','pinsearch','pinterestsearch',
  'ytsearch','yts','youtubesearch','xsearch','twsearch','linkedinpeople','linpeople','linkedinjobs',
  'linjobs','threadsearch','threadssearch','snapsearch','snapchatsearch'
]);

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const p=path.join(dir,e.name);
    if (e.isDirectory()) walk(p,out); else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function declaredCommands(src) {
  const found = new Set();
  for (const m of src.matchAll(/command\s*:\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1].toLowerCase());
  for (const m of src.matchAll(/aliases\s*:\s*\[([\s\S]*?)\]/g)) {
    for (const x of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) found.add(x[1].toLowerCase());
  }
  return found;
}

function backupConflicts() {
  const dirs = ['plugins','plugins2','esportplugin','commands','src'];
  const files = dirs.flatMap(d => walk(path.join(ROOT,d)));
  const moved=[];
  for (const file of files) {
    if (file.includes(path.join('node_modules', path.sep))) continue;
    const src = fs.readFileSync(file,'utf8');
    const cmds = declaredCommands(src);
    const hit = [...cmds].some(c => COMMANDS.has(c));
    if (!hit) continue;
    const rel = path.relative(ROOT,file);
    const dest = path.join(BACKUP,rel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.copyFileSync(file,dest);
    fs.unlinkSync(file);
    moved.push(rel);
  }
  return moved;
}

function copyTree(src,dst) {
  fs.mkdirSync(dst,{recursive:true});
  for (const e of fs.readdirSync(src,{withFileTypes:true})) {
    const a=path.join(src,e.name), b=path.join(dst,e.name);
    if (e.isDirectory()) copyTree(a,b); else fs.copyFileSync(a,b);
  }
}

console.log('='.repeat(72));
console.log('ABIX-AE SOCIAL SLIDER V8 INSTALLER');
console.log('Direct Apify multi-key mode — no Social Gateway required');
console.log('='.repeat(72));

const moved = backupConflicts();
console.log(`Backed up ${moved.length} conflicting command file(s).`);
if (moved.length) console.log(moved.map(x=>`  • ${x}`).join('\n'));

fs.mkdirSync(TARGET_DIR,{recursive:true});
copyTree(PAYLOAD,TARGET_DIR);
const supportDst = path.join(ROOT,'lib','abixSocial');
copyTree(path.join(SUPPORT,'abixSocial'),supportDst);
copyTree(APIFY,path.join(ROOT,'apify-rotator-kit'));
copyTree(path.join(__dirname,'assets'),path.join(ROOT,'assets','abix-social'));

console.log('\nInstalled:');
console.log('  • native swipe carousel');
console.log('  • direct Apify search');
console.log('  • APIFY_TOKEN_1 ... APIFY_TOKEN_10+ rotation');
console.log('  • TikTok / Instagram / Facebook / Reddit / Pinterest / YouTube / X');
console.log('  • LinkedIn people/jobs / Threads / Snapchat');
console.log('\nRestart your bot:');
console.log('  node node.js');
console.log('\nTest:');
console.log('  -slidermenu');
console.log('  -ttsearch cats');
console.log('  -igsearch Ronaldo Edit');
console.log('  -ytsearch cats');
