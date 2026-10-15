const messages = [
  "Bhai, itni choti umar me itne anubhav kahan se laate ho, ya Google se copy-paste karte ho?",
  "Zindagi me do hi cheezein mushkil hain: ek subah uthna, aur doosra samajhdaar banne ki koshish karna.",
  "Hum wo hain jo alarm lagate hain subah uthne ke liye, phir usi alarm ko band karke so jaate hain.",
  "Agar laziness ek Olympic sport hota, toh hum pakka gold medal jeet kar aate, bas uth kar jaane ki takleef na hoti.",
  "Jitna dhyan hum log dusron ke mamlon me dete hain, utna padhai me dete toh NASA me scientist hote.",
  "Pehle log kehte the 'padh likh kar nawab banoge', aajkal kehte hain 'Wi-Fi ka password batao nawab banoge'.",
  "Apne doston se zyada bharosa toh mujhe apne phone ki 1% battery par hota hai, kamsekam wo alert toh deti hai.",
  "Humari fitrat hi aisi hai, free ki chai mil jaye toh zeher bhi meetha lagta hai.",
  "Neend aur humara purana aashiqana rishta hai, subah hote hi juda hona padta hai.",
  "Zindagi ek roller coaster ride hai, bas fark itna hai ki yahan ticket kharidne ke baad bhi ulte hi chakkar aate hain."
];

module.exports = {
  name: 'funnyurdumessage',
  description: 'Sends a random funny Urdu message',
  async execute(sock, m, args) {
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    await sock.sendMessage(m.key.remoteJid, { text: randomMsg }, { quoted: m });
  }
};