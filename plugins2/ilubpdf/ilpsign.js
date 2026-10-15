'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpsign',aliases:[],category:'ilovepdf',description:'ILP sign',usage:'-ilpsign <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpsign',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
