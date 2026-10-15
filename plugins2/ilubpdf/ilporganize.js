'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilporganize',aliases:[],category:'ilovepdf',description:'ILP organize',usage:'-ilporganize <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilporganize',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
