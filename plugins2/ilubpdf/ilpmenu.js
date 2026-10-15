'use strict';
const { menu } = require('./runtime.cjs');
module.exports={command:'ilpmenu',aliases:['ilphelp','pdfmenu'],category:'ilovepdf',description:'ILP PDF suite menu',async handler(sock,message,args,context={}){return sock.sendMessage(context.chatId||message.key.remoteJid,{text:menu(context.prefix||'-')},{quoted:message});}};
