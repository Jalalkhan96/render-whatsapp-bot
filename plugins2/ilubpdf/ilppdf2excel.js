'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppdf2excel',aliases:[],category:'ilovepdf',description:'ILP pdf-to-excel',usage:'-ilppdf2excel <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppdf2excel',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
