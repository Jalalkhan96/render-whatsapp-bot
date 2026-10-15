'use strict';
const {runTool}=require('./runtime.cjs');
module.exports={command:'ilppdfa',aliases:[],category:'ilovepdf',description:'ILP pdf-to-pdfa',usage:'-ilppdfa <options> (reply to input)',async handler(sock,message,args,context={}){try{return await runTool('ilppdfa',sock,message,args,context);}catch(e){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:`❌ ${e.message}`},{quoted:message});}}};
