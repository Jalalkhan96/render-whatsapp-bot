'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpforms',aliases:[],category:'ilovepdf',description:'ILP forms',usage:'-ilpforms <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpforms',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
