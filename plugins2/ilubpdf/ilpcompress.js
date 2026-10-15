'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpcompress',aliases:[],category:'ilovepdf',description:'ILP compress',usage:'-ilpcompress <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpcompress',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
