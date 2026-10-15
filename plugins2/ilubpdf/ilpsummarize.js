'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpsummarize',aliases:[],category:'ilovepdf',description:'ILP summarize',usage:'-ilpsummarize <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpsummarize',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
