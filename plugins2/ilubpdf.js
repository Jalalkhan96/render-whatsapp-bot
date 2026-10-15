'use strict';
const { imageToPdfShortcut } = (() => {
  const rt = require('./ilubpdf/runtime.cjs');
  return { imageToPdfShortcut: async (sock,message,context) => {
    const jid=context.chatId||message.key.remoteJid;
    const tmp=require('os').tmpdir();
    try {
      // Delegate to the normal jpg-to-pdf tool through a synthetic command path.
      const c=require('./ilubpdf/runtime.cjs');
      const got = c.currentOrQuoted(message);
      if (!got) return sock.sendMessage(jid,{text:c.menu(context.prefix||'-')},{quoted:message});
      const m=got.message||{};
      if (!m.imageMessage) return sock.sendMessage(jid,{text:c.menu(context.prefix||'-')},{quoted:message});
      return await c.runTool('ilpjpg2pdf',sock,message,[],context);
    } catch(e) { return sock.sendMessage(jid,{text:`❌ ${e.message}`},{quoted:message}); }
  }};
})();
module.exports={command:'ilp',aliases:['ilovepdf'],category:'ilovepdf',description:'Reply to image → PDF',async handler(sock,message,args,context={}){const c=require('./ilubpdf/runtime.cjs');if(args?.length)return sock.sendMessage(context.chatId||message.key.remoteJid,{text:c.menu(context.prefix||'-')},{quoted:message});return imageToPdfShortcut(sock,message,context);}};
