const path=require('path');
const btn=require('./wa-tricks/wa-trick-buttons.cjs');
const list=require('./wa-tricks/wa-trick-listmenu.cjs');
const form=require('./wa-tricks/wa-trick-form.cjs');
const polls=require('./wa-tricks/wa-trick-polls.cjs');
const fmt=require('./wa-tricks/wa-trick-formatting.cjs');
const contact=require('./wa-tricks/wa-trick-contact-location.cjs');
const group=require('./wa-tricks/wa-trick-group.cjs');
const html=require('./wa-tricks/wa-trick-html.cjs');
const broadcast=require('./wa-tricks/wa-trick-broadcast.cjs');
module.exports=[
 {command:'watricks',aliases:['tricksmenu'],category:'utility',description:'Show WhatsApp tricks menu',usage:'-watricks',async handler(sock,m,a,c={}){return sock.sendMessage(c.chatId||m.key.remoteJid,{text:`🧰 *WHATSAPP TRICKS*\n\n-buttons\n-listmenu\n-form\n-poll / -quiz\n-code / -codeview / -cb\n-format\n-vcard / -location\n-mentionall\n-gif / -viewonce\n-html\n-broadcast (owner only)\n\nFull reference: plugins2/wa-tricks/WHATSAPP-100-TRICKS.md`},{quoted:m});}},
 {command:'buttons',aliases:['btn'],category:'utility',description:'Send classic reply buttons',usage:'-buttons',async handler(sock,m,a,c={}){return btn.sendReplyButtons(sock,c.chatId||m.key.remoteJid,{text:'🔘 Choose an option',footer:'MYBOT',buttons:[{id:'menu',label:'📋 Menu'},{id:'help',label:'🆘 Help'}]},m);}},
 {command:'listmenu',aliases:['list'],category:'utility',description:'Send a WhatsApp list menu',usage:'-listmenu',async handler(sock,m,a,c={}){return list.sendMainMenu(sock,c.chatId||m.key.remoteJid,m);}},
 {command:'form',aliases:['entryform'],category:'utility',description:'Start chat-form demo',usage:'-form',async handler(sock,m,a,c={}){return form.startForm(sock,c.chatId||m.key.remoteJid,m);}},
 {command:'poll',aliases:['quiz'],category:'utility',description:'Create a WhatsApp poll',usage:'-poll Question | A | B',async handler(sock,m,a,c={}){const p=String(a.join(' ')).split('|').map(x=>x.trim()).filter(Boolean);if(p.length<3)return sock.sendMessage(c.chatId||m.key.remoteJid,{text:'Usage: -poll Question | A | B'},{quoted:m});return polls.sendPoll(sock,c.chatId||m.key.remoteJid,{question:p[0],options:p.slice(1),multi:false},m);}},
 {command:'format',aliases:['formatdemo'],category:'utility',description:'Show formatting examples',usage:'-format',async handler(sock,m,a,c={}){return fmt.sendFormatDemo(sock,c.chatId||m.key.remoteJid,m);}},
 {command:'location',aliases:['loc'],category:'utility',description:'Send a static location pin',usage:'-location 34.01 72.47',async handler(sock,m,a,c={}){const lat=Number(a[0]),lng=Number(a[1]);if(!Number.isFinite(lat)||!Number.isFinite(lng))return sock.sendMessage(c.chatId||m.key.remoteJid,{text:'Usage: -location <lat> <lng>'},{quoted:m});return contact.sendLocation(sock,c.chatId||m.key.remoteJid,{lat,lng,name:a.slice(2).join(' ')||'Location'},m);}},
 {command:'mentionall',aliases:['tagall2'],category:'moderation-tool',description:'Mention all group members',usage:'-mentionall [text]',groupOnly:true,adminOnly:true,async handler(sock,m,a,c={}){const jid=c.chatId||m.key.remoteJid;const meta=await sock.groupMetadata(jid);const p=(meta.participants||[]).map(x=>x.id||x.lid||x.jid).filter(Boolean);return group.mentionAll(sock,jid,a.join(' ')||'Attention everyone 👋',p);}},
 {command:'html',aliases:['sendhtml'],category:'utility',description:'Send a local HTML file',usage:'-html plugins2/wa-tricks/games/dino-runner.html',async handler(sock,m,a,c={}){const rel=a.join(' ').trim();if(!rel)throw new Error('HTML file path is required.');const root=path.resolve(process.cwd());const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw new Error('Only project-local files are allowed.');return html.sendHtmlFile(sock,c.chatId||m.key.remoteJid,file,{caption:'📄 Open in your browser'},m);}},
 {command:'broadcast',aliases:['bc'],category:'owner',description:'Broadcast text to validated JIDs',usage:'-broadcast jid1,jid2 | message',ownerOnly:true,async handler(sock,m,a,c={}){const parts=String(a.join(' ')).split('|');const jids=parts[0].split(',').map(x=>x.trim()).filter(x=>x.includes('@'));const text=parts.slice(1).join('|').trim();if(!jids.length||!text)return sock.sendMessage(c.chatId||m.key.remoteJid,{text:'Usage: -broadcast jid1,jid2 | message'},{quoted:m});return broadcast.broadcast(sock,jids,{text});}}
];
