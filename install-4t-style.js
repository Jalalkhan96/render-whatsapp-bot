const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGETS = new Set([
  'slidermenu',
  'ttsearch','igsearch','fbsearch','redditsearch','pinsearch','ytsearch',
  'xsearch','linkedinpeople','linkedinposts','linkedinjobs','threadsearch','snapprofile'
]);

const pluginDirs = ['plugins','plugins2','esportplugin']
  .map(d => path.join(ROOT,d))
  .filter(fs.existsSync);

const ownDir = path.join(ROOT,'plugins2','4tstyle');
const backup = path.join(ROOT,'.4t-style-backup');
fs.mkdirSync(backup,{recursive:true});

function walk(dir) {
  const out=[];
  for (const name of fs.readdirSync(dir)) {
    const p=path.join(dir,name);
    const st=fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
function commandNames(file) {
  const s=fs.readFileSync(file,'utf8');
  const names=[];
  for (const re of [
    /command\s*:\s*['"`]([^'"`]+)['"`]/g,
    /name\s*:\s*['"`]([^'"`]+)['"`]/g
  ]) {
    let m;
    while ((m=re.exec(s))) names.push(String(m[1]).toLowerCase());
  }
  return names;
}

let moved=0;
for (const dir of pluginDirs) {
  for (const file of walk(dir)) {
    if (file.startsWith(ownDir + path.sep)) continue;
    if (path.resolve(file) === path.resolve(path.join(ROOT,'plugins2','slidermenu.js'))) continue;
    const baseName = path.basename(file).toLowerCase();
    if (baseName.includes('slidermenu-loader') || baseName === 'slidermenu.js') {
      const rel=path.relative(ROOT,file);
      const dest=path.join(backup,rel);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.renameSync(file,dest);
      console.log('BACKUP',rel);
      moved++;
      continue;
    }
    const names=commandNames(file);
    if (!names.some(n=>TARGETS.has(n))) continue;
    const rel=path.relative(ROOT,file);
    const dest=path.join(backup,rel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.renameSync(file,dest);
    console.log('BACKUP',rel);
    moved++;
  }
}

console.log(`\n4T-style conflict cleanup complete. Backed up ${moved} old plugin file(s).`);
console.log('Now restart the bot with: node node.js');
