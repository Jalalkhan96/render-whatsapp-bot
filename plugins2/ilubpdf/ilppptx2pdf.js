'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppptx2pdf',aliases:[],category:'ilovepdf',description:'ILP pptx-to-pdf',usage:'-ilppptx2pdf <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppptx2pdf',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
