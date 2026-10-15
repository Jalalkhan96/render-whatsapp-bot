'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilphtml2pdf',aliases:[],category:'ilovepdf',description:'ILP html-to-pdf',usage:'-ilphtml2pdf <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilphtml2pdf',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
