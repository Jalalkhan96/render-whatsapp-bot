const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const wordToLower = (err) => String(err?.message || err || '').toLowerCase();

const RULES = [
  {
    match: /(fetch failed|enetdown|enotfound|econnrefused|econnreset|timeout|timed?out|network|socket)/,
    lines: [
      '😅 Server bhai ne aaram pakar liya hai. Thoda ruk ke try karo, warna 5 min ki chai pe aa jao ☕',
      '🚧 API ki spa chal rahi hai, thodi der baad wapas try karna! 😆',
      '📡 Network ne bhi ajkal leave le li hai. Do minute baad dekhna yaar!'
    ]
  },
  {
    match: /(401|unauthorized|api key|token|forbidden|403)/,
    lines: [
      '🔑 Bhaijaan, is kaam ke liye cholesterol high rakhna mat, API ne darwaza band kar diya hai 😂',
      '🙅 API bola "aaj laut aao, ghar aaye to baat karenge" 😅',
      '🚫 Bina key ke darwaza nahi khulta bhai. Aage badho, aage badho!'
    ]
  },
  {
    match: /(404|not found|no results?|nothing|empty|no data)/,
    lines: [
      '🔍 Ye cheez milni hi nahi chah rahi, jaise meri chahi bandi 😂',
      '🧐 Endia pata nahi, kuch nahi mila. UID dobara check kar ke dekho!',
      '❓ Mujhe to kuch nahi mila. Kya Rapunzel ne baal chhupa liye?! 😆'
    ]
  },
  {
    match: /(429|rate limit|too many)/,
    lines: [
      '⏳ Itna jaldi jaldi?! API ki toh chai hi baaki hai. 5 minute sabr karle bhai 😴',
      '🐢 Slow down yaar! Server ne bola thoda relax ho jao.',
      '☕ API abhi chai peene gaya hai, thodi der baad aana!'
    ]
  },
  {
    match: /(parse|json|cannot read|undefined|null)/,
    lines: [
      '🤯 Kuch gadbad khuda se ho gaya, jaise Excel ki tables 😅 Thodi der baad try kar.',
      '🌀 Data ne ulti kar di, thoda ruk kar wapas try karo!',
      '🎭 Yahan drama ho raha hai, data hi samajh nahi aaya 😆'
    ]
  }
];

function funnyError(err) {
  const text = wordToLower(err);
  for (const rule of RULES) {
    if (rule.match.test(text)) return pick(rule.lines);
  }
  return pick([
    '😅 Kuch bey-ja hua hai bhai, thodi der baad try karo aur dua karna 🙏',
    '🤷 Mujhe bhi samajh nahi aya kya hua. Bashsh hoga, wapas try kar!',
    '💥 Boooom! Error aa gaya. Lakdi ka samay, thandi chapphad, dobara try kar!',
    '😭 Aaj kismat saath nahi hai. Kal se lamba din hai, phir try karenge!'
  ]);
}

module.exports = { funnyError };