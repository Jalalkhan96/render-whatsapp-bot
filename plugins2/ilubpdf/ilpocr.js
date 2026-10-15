'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilpocr',aliases:[],category:'ilovepdf',description:'ILP ocr',usage:'-ilpocr <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilpocr',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
