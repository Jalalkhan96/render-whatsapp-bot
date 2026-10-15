'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpword2pdf',aliases:[],category:'ilovepdf',description:'ILP word-to-pdf',usage:'-ilpword2pdf <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpword2pdf',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
