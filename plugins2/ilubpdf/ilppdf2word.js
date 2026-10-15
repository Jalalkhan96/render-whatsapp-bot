'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppdf2word',aliases:[],category:'ilovepdf',description:'ILP pdf-to-word',usage:'-ilppdf2word <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppdf2word',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
