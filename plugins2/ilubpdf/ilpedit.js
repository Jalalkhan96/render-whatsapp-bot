'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpedit',aliases:[],category:'ilovepdf',description:'ILP edit',usage:'-ilpedit <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpedit',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
