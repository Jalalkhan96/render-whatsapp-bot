'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpsplit',aliases:[],category:'ilovepdf',description:'ILP split',usage:'-ilpsplit <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpsplit',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
