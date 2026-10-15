'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppagenumbers',aliases:[],category:'ilovepdf',description:'ILP pagenumbers',usage:'-ilppagenumbers <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppagenumbers',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
