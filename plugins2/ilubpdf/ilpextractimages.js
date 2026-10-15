'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpextractimages',aliases:[],category:'ilovepdf',description:'ILP extract-images',usage:'-ilpextractimages <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpextractimages',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
