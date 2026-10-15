'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppdf2jpg',aliases:[],category:'ilovepdf',description:'ILP pdf-to-jpg',usage:'-ilppdf2jpg <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppdf2jpg',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
