'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpextracttext',aliases:[],category:'ilovepdf',description:'ILP extract-text',usage:'-ilpextracttext <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpextracttext',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
