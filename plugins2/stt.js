const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: '120363413637544342@newsletter',
    newsletterName: 'ABIX-AE',
    serverMessageId: -1
  }
};

module.exports = {
  command: 'stt',
  aliases: ['voicetotext', 'v2t', 'transcribe'],
  category: 'language',
  description: 'Converts voice/audio message to text using Whisper AI (Groq)',
  usage: '.stt (reply to a voice note or audio)',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '.';

    const groqToken = process.env.GROQ_API_KEY;

    if (!groqToken) {
      const errText =
        `❌ *Groq API Key Missing!*\n\n` +
        `Is command ke liye Groq ka free API key chahiye (Whisper AI).\n\n` +
        `*Steps:*\n` +
        `1. https://console.groq.com par jayein\n` +
        `2. Free account banayein\n` +
        `3. "API Keys" section mein ja kar key generate karein\n` +
        `4. \`.env\` file mein add karein:\n\n` +
        `\`GROQ_API_KEY=your_key_here\`\n\n` +
        `_Groq bilkul FREE hai aur Whisper AI bohut zyada tez hai!_`;

      return sock.sendMessage(chatId, { text: errText, contextInfo: FAKE_FORWARD }, { quoted: message });
    }

    // Get the quoted message
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      return sock.sendMessage(chatId, {
        text: `❌ Please *reply* to a voice note or audio message with \`${prefix}stt\`.`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    // Check if it's audio
    const audioMessage = quoted.audioMessage;
    if (!audioMessage) {
      return sock.sendMessage(chatId, {
        text: `❌ The replied message is not an audio/voice note.\n\nPlease reply to a voice note with \`${prefix}stt\`.`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    try {
      await sock.sendPresenceUpdate('composing', chatId);

      // Download the audio buffer
      const mediaMessage = { message: quoted };
      const audioBuffer = await downloadMediaMessage(
        mediaMessage,
        'buffer',
        {},
        {
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );

      // Build FormData for Groq Whisper API
      const form = new FormData();
      form.append('file', audioBuffer, {
        filename: 'audio.ogg',
        contentType: 'audio/ogg',
      });
      form.append('model', 'whisper-large-v3');
      form.append('response_format', 'json');
      // Optional: set language, or let Whisper auto-detect
      // form.append('language', 'en');

      const { data } = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${groqToken}`,
          }
        }
      );

      const transcribedText = data?.text?.trim();

      if (!transcribedText) {
        return sock.sendMessage(chatId, {
          text: `❌ No speech detected in the audio, or the audio is too short/unclear.`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      const replyText =
        `*ABIX-AE | Voice → Text* 🎙️\n\n` +
        `📝 *Transcribed Text:*\n${transcribedText}\n\n` +
        `✅ Transcription complete`;

      await sock.sendMessage(chatId, {
        text: replyText,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

    } catch (error) {
      console.error('STT Error:', error.message);

      const adminNumber = process.env.ADMIN_NUMBER || process.env.OWNER_NUMBER || '';
      const adminContact = adminNumber ? `wa.me/${adminNumber}` : 'admin ko WhatsApp karein';

      if (error.response?.status === 401) {
        await sock.sendMessage(chatId, {
          text: `❌ *Invalid Groq API Key!*\n\nPlease check the \`.env\` file.\n\nAdmin se rabta karein: ${adminContact}`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });

      } else if (error.response?.status === 429) {
        // Bilingual detailed rate limit message
        const rateLimitMsg =
          `╔══════════════════════╗\n` +
          `║  ⚠️  ABIX-AE ALERT  ⚠️  ║\n` +
          `╚══════════════════════╝\n\n` +
          `🔴 *API Limit Khatam! / API Limit Reached!*\n\n` +

          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🇵🇰 *اردو میں:*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Bot ka *Voice → Text* quota khatam ho gaya hai.\n` +
          `Bot ko dobara chalane ke liye apna *FREE API Key* banao 👇\n\n` +

          `📋 *آسان Steps (Sirf 2 Minute):*\n\n` +
          `*Step 1* 🌐 https://console.groq.com par jayein\n` +
          `*Step 2* 📝 "Sign Up" — Google ya GitHub se bhi ho sakta hai\n` +
          `*Step 3* 🔑 Left side → *"API Keys"* → *"Create API Key"*\n` +
          `*Step 4* ✏️ Naam: "abix-bot" rakh dein\n` +
          `*Step 5* 📋 Jo key bane (gsk_...) use *COPY* kar lein\n` +
          `*Step 6* 📤 Yeh key admin ko bhejein:\n` +
          `          👉 https://${adminContact}\n\n` +

          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🇺🇸 *English:*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `The bot's *Voice → Text* daily quota is exhausted.\n` +
          `Please create a *FREE API Key* to help the bot!\n\n` +

          `📋 *Easy Steps (2 Minutes):*\n\n` +
          `*Step 1* 🌐 Visit https://console.groq.com\n` +
          `*Step 2* 📝 Click "Sign Up" (Google/GitHub works)\n` +
          `*Step 3* 🔑 Left sidebar → *"API Keys"* → *"Create API Key"*\n` +
          `*Step 4* ✏️ Name it: "abix-bot"\n` +
          `*Step 5* 📋 COPY the generated key (starts with gsk_...)\n` +
          `*Step 6* 📤 Send the key to admin:\n` +
          `          👉 https://${adminContact}\n\n` +

          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 *Join ABIX-AE Channel for Updates:*\n` +
          `👉 https://whatsapp.com/channel/0029VbE7AW8GOj9rTFZnej0y\n\n` +
          `╔══════════════════════╗\n` +
          `║   ✨ ABIX-AE BOT ✨   ║\n` +
          `║  Groq FREE · No Card ║\n` +
          `╚══════════════════════╝`;

        await sock.sendMessage(chatId, {
          text: rateLimitMsg,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });

      } else {
        await sock.sendMessage(chatId, {
          text: `❌ *Error occurred:*\n${error.message}`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }
    }
  }
};
