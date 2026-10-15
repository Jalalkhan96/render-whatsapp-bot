'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpcompare',aliases:[],category:'ilovepdf',description:'ILP compare',usage:'-ilpcompare <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpcompare',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
