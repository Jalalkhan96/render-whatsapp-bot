'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const roots=['plugins','plugins2','esportplugin','plugin4'];
const removed=new Set(['sudo','pair','clone','gitclone','gitclone2','rent','rentbot','githubdl','githubdl2','paircode','pairingcode']);
const SKIP=new Set(['node_modules','.git','tests','test','__tests__','engines','fixtures','coverage','dist','build']);
const files=[];
function walk(dir){ if(!fs.existsSync(dir))return; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ if(e.isDirectory()&&SKIP.has(e.name.toLowerCase()))continue; const p=path.join(dir,e.name); if(e.isDirectory())walk(p); else if(e.name.endsWith('.js'))files.push(p); }}
roots.forEach(walk);
const sourceRank=f=>{const r=path.relative(process.cwd(),f).replace(/\\/g,'/').toLowerCase();return r.startsWith('plugins/')?1:r.startsWith('plugins2/')?2:r.startsWith('esportplugin/')?3:r.startsWith('plugin4/')?4:9;};
const commands=new Map(); const aliases=new Map();
for(const file of files){const src=fs.readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g,'$1'); for(const m of src.matchAll(/command\s*:\s*['\"]([a-z0-9_-]+)['\"]/gi)){const k=m[1].toLowerCase();if(!commands.has(k))commands.set(k,[]);commands.get(k).push(file);} for(const m of src.matchAll(/aliases\s*:\s*\[([^\]]*)\]/gsi)){for(const a of m[1].matchAll(/['\"]([a-z0-9_-]+)['\"]/gi)){const k=a[1].toLowerCase();if(!aliases.has(k))aliases.set(k,[]);aliases.get(k).push(file);}}}
const effective=new Map([...commands].map(([k,v])=>[k,v.slice().sort((a,b)=>sourceRank(a)-sourceRank(b)||a.localeCompare(b))[0]]));
const names=new Set(effective.keys());
const forbidden=[...names].filter(x=>removed.has(x));
assert.deepStrictEqual(forbidden,[],`removed command still declared: ${forbidden.join(', ')}`);
const adultRoots = [
  'nsfw','hentai','porn','pornhub','xvideos','xvideo','xnxx','xhamster','redgifs',
  'eporner','erome','tnaflix','youporn','redtube','onlyfans','fansly','nhentai',
  'hitomi','e621','danbooru','gelbooru','rule34','hentaihaven','hentaifox','realbooru',
  'e621','sankaku','yande','xbooru','paheal','tbib','nijie','fakku','motherless',
  'chaturbate','stripchat','livejasmin','bongacams','nsfwneko','adult',
];
const adultSuffixes = ['search','find','lookup','download','downloader','dl','list','sources','source','menu','random','trending','latest','video','videos','image','images','gif','gifs','mode','enable','disable','on','off','feed','explore','browse','get','info','catalog','catalogue','api','test'];
const allNames = new Set([...names, ...aliases.keys()]);
const adultDeclarations = [...allNames].filter((name) => {
  const flat = name.replace(/[^a-z0-9]/g, '');
  if (flat.startsWith('naddadult')) return true;
  const normalized = flat.replace(/^(?:pp|nadd)/, '');
  return adultRoots.some((root) => normalized === root || adultSuffixes.some((suffix) => normalized === `${root}${suffix}`));
});
assert.deepStrictEqual(adultDeclarations, [], `adult command/alias still declared: ${adultDeclarations.join(', ')}`);
const ppScrapers = require('../plugins2/pplib/scrapers.cjs');
assert.deepStrictEqual(ppScrapers.VIDEO_SITES, {}, 'no adult video extractor registry may be exposed');
const gifScraperSource = fs.readFileSync(path.join(process.cwd(), 'plugins2/gifscrape.js'), 'utf8');
assert.ok(!/redgifs/i.test(gifScraperSource), 'adult GIF source must not be registered');
console.log(`[PASS] effective command inventory: ${effective.size} commands; adult command/alias declarations removed; safe registry retained`);
