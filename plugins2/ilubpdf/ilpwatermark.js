'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpwatermark',aliases:[],category:'ilovepdf',description:'ILP watermark',usage:'-ilpwatermark <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpwatermark',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
