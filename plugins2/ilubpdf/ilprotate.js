'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilprotate',aliases:[],category:'ilovepdf',description:'ILP rotate',usage:'-ilprotate <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilprotate',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
