'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpexcel2pdf',aliases:[],category:'ilovepdf',description:'ILP excel-to-pdf',usage:'-ilpexcel2pdf <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpexcel2pdf',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
