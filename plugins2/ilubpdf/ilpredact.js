'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpredact',aliases:[],category:'ilovepdf',description:'ILP redact',usage:'-ilpredact <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpredact',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
