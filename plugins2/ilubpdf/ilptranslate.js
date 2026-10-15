'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilptranslate',aliases:[],category:'ilovepdf',description:'ILP translate',usage:'-ilptranslate <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilptranslate',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
