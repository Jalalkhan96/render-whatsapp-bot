'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppdf2md',aliases:[],category:'ilovepdf',description:'ILP pdf-to-markdown',usage:'-ilppdf2md <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppdf2md',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
