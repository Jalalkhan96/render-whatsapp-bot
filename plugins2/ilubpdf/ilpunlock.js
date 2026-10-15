'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpunlock',aliases:[],category:'ilovepdf',description:'ILP unlock',usage:'-ilpunlock <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpunlock',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
