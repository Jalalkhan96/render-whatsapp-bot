'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpjpg2pdf',aliases:[],category:'ilovepdf',description:'ILP jpg-to-pdf',usage:'-ilpjpg2pdf <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpjpg2pdf',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
