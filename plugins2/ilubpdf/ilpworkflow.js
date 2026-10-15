'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpworkflow',aliases:[],category:'ilovepdf',description:'ILP workflow',usage:'-ilpworkflow <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpworkflow',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
