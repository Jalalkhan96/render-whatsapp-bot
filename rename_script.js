const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file === 'node_modules' || file === '.git' || file === 'session' || file === 'baileys_store.json') return;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      if (file.endsWith('.js')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const files = walk('.');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;
  
  // Update internal imports from abixDownloader to abixDownloader
  content = content.replace(/abixDownloader/g, 'abixDownloader');
  content = content.replace(/abixsocial/g, 'abixsocial');
  content = content.replace(/abix/g, 'abix');
  content = content.replace(/ABIX/g, 'ABIX');
  
  if (content !== original) {
    fs.writeFileSync(f, content);
  }
});
