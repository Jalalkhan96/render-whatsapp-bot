'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpprotect',aliases:[],category:'ilovepdf',description:'ILP protect',usage:'-ilpprotect <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpprotect',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
