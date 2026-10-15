'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpcrop',aliases:[],category:'ilovepdf',description:'ILP crop',usage:'-ilpcrop <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpcrop',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
