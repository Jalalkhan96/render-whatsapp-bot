const axios = require('axios');
const { FAKE_FORWARD, askAI, inputText, wrap, statistics, grade } = require('../lib/studyTools');

const quizzes = new Map();
const send = (sock, message, text, extra = {}) => sock.sendMessage(message.key.remoteJid, { text, contextInfo: FAKE_FORWARD.contextInfo, ...extra }, { quoted: message });
const aiCommand = (command, title, instruction) => ({
  command, aliases: [], category: 'study', description: title, usage: `.${command} <text>`,
  async handler(sock, message, args) {
    const input = inputText(message, args);
    if (!input) return send(sock, message, `⚡ Topic/question do. Example: .${command} operating systems`);
    try { return send(sock, message, wrap(title.toUpperCase(), await askAI(`${instruction}\nStudent input: ${input}\nBe concise, accurate, student-friendly. Do not invent citations.`))); }
    catch (error) { return send(sock, message, `❌ Study AI unavailable: ${error.message}`); }
  }
});

const menu = {
  command: 'studymenu', aliases: ['studymenu2'], category: 'study', description: 'Study and exam tools', usage: '.studymenu',
  async handler(sock, message, args, context = {}) {
    const p = context.prefix || '.';
    const text = `╭───「 📚 *STUDY MENU* 」\n│ AI, practice, math, science aur academic tools\n╰───────────────○\n\n*🎓 Study Assistant*\n└ ⚡ \`${p}ask <question>\`\n└ ⚡ \`${p}explain <topic>\`\n└ ⚡ \`${p}summarize <text>\`\n└ ⚡ \`${p}notes <topic>\`\n└ ⚡ \`${p}studyplan <subject> <days>\`\n└ ⚡ \`${p}revision <topic>\`\n\n*📝 Practice*\n└ ⚡ \`${p}quiz <topic>\`\n└ ⚡ \`${p}mcq <topic>\`\n└ ⚡ \`${p}truefalse <topic>\`\n└ ⚡ \`${p}fillblank <topic>\`\n└ ⚡ \`${p}exam <topic>\`\n└ ⚡ \`${p}flashcards <topic>\`\n\n*➗ Math & Academic*\n└ ⚡ \`${p}solve <expression>\`\n└ ⚡ \`${p}mathsteps <expression>\`\n└ ⚡ \`${p}statistics <operation> <numbers>\`\n└ ⚡ \`${p}unit <value> <from> <to>\`\n└ ⚡ \`${p}gpa\` | \`${p}cgpa\` | \`${p}grade <marks>\`\n\n*🔬 Science & Research*\n└ ⚡ \`${p}periodic\` | \`${p}element <name/symbol>\`\n└ ⚡ \`${p}book <query>\` | \`${p}isbn <isbn>\`\n└ ⚡ \`${p}paper <query>\` | \`${p}doi <doi>\`\n└ ⚡ \`${p}citation <doi/title>\`\n\n*💻 CS & Planning*\n└ ⚡ \`${p}codeexplain <code>\`\n└ ⚡ \`${p}algorithm <topic>\` | \`${p}ds <topic>\`\n└ ⚡ \`${p}sqlhelp <question>\`\n└ ⚡ \`${p}debug <error/code>\`\n└ ⚡ \`${p}timetable <subjects>\` | \`${p}pomodoro\`\n\n⚠️ AI answers educational guidance hain; official exam paper nahi.`;
    return send(sock, message, `${text}\n└ ⚡ \`${p}probability <question>\`\n└ ⚡ \`${p}author <name>\`\n└ ⚡ \`${p}research <query>\`\n└ ⚡ \`${p}studytime\` | \`${p}deadline <date> <task>\``);
  }
};

const commands = [
  menu,
  {
    command: 'probability', aliases: ['prob'], category: 'study', description: 'Solve basic probability questions', usage: '.probability 5 choose 2',
    async handler(sock, message, args) {
      const input = args.join(' ').trim().toLowerCase();
      const match = input.match(/^(\d+)\s+choose\s+(\d+)$/);
      if (!match) return send(sock, message, `⚡ Format: .probability 5 choose 2`);
      const n = Number(match[1]); const r = Number(match[2]);
      if (r > n || n > 170) return send(sock, message, '❌ Valid n/r do: n >= r and n <= 170.');
      let factorial = 1n;
      const fact = value => { factorial = 1n; for (let i = 2n; i <= BigInt(value); i++) factorial *= i; return factorial; };
      return send(sock, message, wrap('PROBABILITY', `Combination: C(${n}, ${r})\nAnswer: ${fact(n) / (fact(r) * fact(n - r))}`));
    }
  },
  {
    command: 'author', aliases: ['bookauthor'], category: 'study', description: 'Search Open Library author metadata', usage: '.author <name>',
    async handler(sock, message, args) {
      const query = args.join(' ').trim();
      if (!query) return send(sock, message, '⚡ Author name do. Example: .author Isaac Newton');
      try {
        const { data } = await axios.get(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(query)}&limit=5`, { timeout: 12000 });
        const rows = (data.docs || []).slice(0, 5).map((author, index) => `${index + 1}. *${author.name || 'Unknown'}*\n   Works: ${author.work_count ?? 'N/A'}\n   🔗 https://openlibrary.org/authors/${author.key || ''}`).join('\n\n');
        return send(sock, message, wrap('AUTHOR SEARCH', rows || 'Author record nahi mila.'));
      } catch (error) { return send(sock, message, `❌ Author search unavailable: ${error.message}`); }
    }
  },
  aiCommand('ask', 'Study Answer', 'Answer the question with: Explanation, Easy Example, Key Point.'),
  aiCommand('explain', 'Topic Explanation', 'Explain with Definition, How it works, Example, Key points and Exam Tip.'),
  aiCommand('summarize', 'Summary', 'Summarize with Main Idea, Key Points and one-line summary.'),
  aiCommand('notes', 'Study Notes', 'Create structured notes with definition, objectives, types, process, advantages, limitations and exam points.'),
  aiCommand('studyplan', 'Study Plan', 'Create a realistic day-by-day study plan. The input may end with a number of days.'),
  aiCommand('revision', 'Revision Notes', 'Create quick revision notes: definition, concepts, formulas, examples, mistakes, exam points and 3 questions.'),
  aiCommand('quiz', 'Interactive Quiz', 'Create five multiple-choice questions with A-D options, answer key and short explanations.'),
  aiCommand('mcq', 'Multiple Choice Questions', 'Create multiple-choice questions with A-D options, answer key and explanations.'),
  aiCommand('truefalse', 'True/False Practice', 'Create five true/false questions with answers and short explanations.'),
  aiCommand('fillblank', 'Fill in the Blanks', 'Create five fill-in-the-blank questions with an answer key.'),
  aiCommand('exam', 'Practice Exam', 'Create a clearly labelled practice exam: 10 MCQs, 5 short questions and 2 long questions.'),
  aiCommand('flashcards', 'Topic Flashcards', 'Create five topic-specific flashcards with Q and A.'),
  aiCommand('codeexplain', 'Code Explanation', 'Explain purpose, flow, important lines, concepts, issues and improvements. Never execute code.'),
  aiCommand('algorithm', 'Algorithm Guide', 'Explain definition, steps, pseudocode, example, time/space complexity and use cases.'),
  aiCommand('ds', 'Data Structure Guide', 'Explain definition, operations, complexity, example, use cases, advantages and limitations.'),
  aiCommand('sqlhelp', 'SQL Help', 'Explain the SQL question safely. Never execute arbitrary SQL.'),
  aiCommand('debug', 'Debug Guide', 'Explain likely cause, safe fix, why and a test. Never execute supplied code.'),
  aiCommand('geometry', 'Geometry Help', 'Solve common area, perimeter, volume, angle and Pythagoras questions deterministically where possible.'),
  aiCommand('algebra', 'Algebra Help', 'Solve or explain the algebra question step by step without inventing results.'),
  aiCommand('physics', 'Physics Help', 'Explain or solve physics questions; show formula, units and substitution.'),
  aiCommand('chemistry', 'Chemistry Help', 'Explain chemistry questions accurately; show balanced equations only when verified.'),
  aiCommand('biology', 'Biology Help', 'Explain biology topics in student-friendly language.'),
  aiCommand('science', 'Science Help', 'Answer general physics, chemistry, biology, astronomy or environment questions.'),
  aiCommand('research', 'Research Search Help', 'Suggest a research direction and keywords, clearly separating suggestions from verified sources.'),
  aiCommand('timetable', 'Study Timetable', 'Create a practical timetable from the supplied subjects and available time.'),
  aiCommand('deadline', 'Deadline Planner', 'Create a task breakdown and deadline plan from the supplied date and work.'),
  aiCommand('studytime', 'Study Time Planner', 'Suggest focused study blocks, breaks and revision intervals.'),
  {
    command: 'unit', aliases: ['convertunit'], category: 'study', description: 'Convert common units', usage: '.unit 5 km mile',
    async handler(sock, message, args) {
      const value = Number(args[0]); const from = String(args[1] || '').toLowerCase(); const to = String(args[2] || '').toLowerCase();
      const factors = { m: 1, meter: 1, km: 1000, mile: 1609.344, mi: 1609.344, cm: 0.01, ft: 0.3048, kg: 1, g: 0.001, lb: 0.45359237, l: 1, liter: 1, ml: 0.001 };
      if (!Number.isFinite(value) || !factors[from] || !factors[to]) return send(sock, message, '⚡ Supported length/mass/volume units: m km mile cm ft kg g lb l ml');
      return send(sock, message, wrap('UNIT CONVERSION', `${value} ${from} = ${(value * factors[from] / factors[to]).toFixed(6).replace(/\.?0+$/, '')} ${to}`));
    }
  },
  {
    command: 'pomodoro', aliases: ['focus'], category: 'study', description: 'Show a Pomodoro study cycle', usage: '.pomodoro',
    async handler(sock, message) { return send(sock, message, wrap('POMODORO', '1. 25 minutes focused study\n2. 5 minutes break\n3. Repeat four times\n4. 15–30 minutes long break\n\nPhone silent, pani paas — focus mode on!')); }
  },
  {
    command: 'paper', aliases: ['papers'], category: 'study', description: 'Search OpenAlex scholarly papers', usage: '.paper <query>',
    async handler(sock, message, args) {
      const q = args.join(' ').trim(); if (!q) return send(sock, message, '⚡ Research topic do.');
      try { const { data } = await axios.get(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=5`, { timeout: 15000, headers: { 'User-Agent': 'ABIX-AE study tool' } }); const rows = (data.results || []).map((x, i) => `${i + 1}. *${x.title || 'Untitled'}*\n   ${(x.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', ') || 'Authors unavailable'}\n   Year: ${x.publication_year || 'N/A'}\n   DOI: ${x.doi || 'N/A'}\n   🔗 ${x.id || 'N/A'}`).join('\n\n'); return send(sock, message, wrap('RESEARCH PAPERS', rows || 'No papers found.')); } catch (error) { return send(sock, message, `❌ OpenAlex unavailable: ${error.message}`); }
    }
  },
  {
    command: 'citation', aliases: ['cite'], category: 'study', description: 'Create a citation from DOI metadata', usage: '.citation <doi>',
    async handler(sock, message, args) {
      const doi = String(args[0] || '').replace(/^https?:\/\/doi.org\//i, ''); if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) return send(sock, message, '⚡ Citation ke liye DOI do, example: .citation 10.1038/s41586-020-2649-2');
      try { const { data } = await axios.get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { timeout: 12000 }); const x = data.message; const authors = (x.author || []).map(a => `${a.family || ''}, ${a.given || ''}`).join(', '); const title = (x.title || ['Untitled'])[0]; const year = x.published?.['date-parts']?.[0]?.[0] || 'n.d.'; const journal = x['container-title']?.[0] || 'N/A'; return send(sock, message, wrap('CITATION', `APA: ${authors || 'Unknown author'} (${year}). ${title}. *${journal}*. https://doi.org/${doi}\n\nIEEE: ${authors || 'Unknown author'}, “${title},” ${journal}, ${year}. doi: ${doi}`)); } catch (error) { return send(sock, message, `❌ Citation metadata unavailable: ${error.message}`); }
    }
  },
  {
    command: 'statistics', aliases: ['statsstudy'], category: 'study', description: 'Calculate statistics', usage: '.statistics mean 10,20,30',
    async handler(sock, message, args) { try { return send(sock, message, wrap('STATISTICS', statistics(args))); } catch (error) { return send(sock, message, `❌ ${error.message}`); } }
  },
  {
    command: 'grade', aliases: ['marks'], category: 'study', description: 'Calculate grade', usage: '.grade 78',
    async handler(sock, message, args) { try { return send(sock, message, wrap('GRADE RESULT', grade(String(args[0] || '').split('/')[0]))); } catch (error) { return send(sock, message, `❌ ${error.message}`); } }
  },
  {
    command: 'gpa', aliases: [], category: 'study', description: 'Calculate weighted GPA', usage: '.gpa 3.5:3,4:3',
    async handler(sock, message, args) {
      const pairs = args.join(' ').split(',').map(x => x.split(':').map(Number));
      if (!pairs.length || pairs.some(([point, credit]) => !Number.isFinite(point) || !Number.isFinite(credit) || credit <= 0)) return send(sock, message, '⚡ Format: .gpa 3.5:3,4:3 (grade points:credits)');
      const credits = pairs.reduce((sum, [, c]) => sum + c, 0); const value = pairs.reduce((sum, [p, c]) => sum + p * c, 0) / credits;
      return send(sock, message, wrap('GPA RESULT', `Weighted GPA: ${value.toFixed(2)}\nTotal credits: ${credits}`));
    }
  },
  {
    command: 'cgpa', aliases: [], category: 'study', description: 'Calculate cumulative GPA', usage: '.cgpa previousCGPA previousCredits semesterGPA semesterCredits',
    async handler(sock, message, args) {
      const [oldGpa, oldCredits, newGpa, newCredits] = args.map(Number);
      if (![oldGpa, oldCredits, newGpa, newCredits].every(Number.isFinite) || oldCredits <= 0 || newCredits <= 0) return send(sock, message, '⚡ Format: .cgpa 3.2 60 3.6 15');
      return send(sock, message, wrap('CGPA RESULT', `New CGPA: ${((oldGpa * oldCredits + newGpa * newCredits) / (oldCredits + newCredits)).toFixed(2)}\nTotal credits: ${oldCredits + newCredits}`));
    }
  },
  {
    command: 'solve', aliases: ['mathsteps'], category: 'study', description: 'Solve simple arithmetic through mathjs', usage: '.solve 2+2',
    async handler(sock, message, args) {
      const expression = args.join(' ').trim(); if (!expression) return send(sock, message, '⚡ Expression do. Example: .solve 2+2');
      const linear = expression.match(/^\s*([+-]?\d*\.?\d*)\s*x\s*([+-])\s*(\d*\.?\d+)\s*=\s*(\d*\.?\d+)\s*$/i);
      if (linear) {
        const coefficient = Number(linear[1] === '' || linear[1] === '+' ? 1 : linear[1] === '-' ? -1 : linear[1]);
        const constant = Number(linear[3]) * (linear[2] === '-' ? -1 : 1);
        const target = Number(linear[4]);
        if (coefficient === 0) return send(sock, message, '❌ Equation mein x ka coefficient zero hai.');
        const answer = (target - constant) / coefficient;
        return send(sock, message, wrap('MATH STEPS', `Step 1: ${expression}\nStep 2: ${coefficient}x = ${target - constant}\nStep 3: x = ${answer}\n\n✅ Answer: x = ${answer}`));
      }
      try { const { data } = await axios.get(`https://api.mathjs.org/v4/?expr=${encodeURIComponent(expression)}`, { timeout: 10000 }); return send(sock, message, wrap('SOLVER', `${expression} = ${data}`)); } catch (error) { return send(sock, message, `❌ Solve nahi hua: ${error.message}`); }
    }
  },
  {
    command: 'element', aliases: [], category: 'study', description: 'Explain a chemical element', usage: '.element iron',
    async handler(sock, message, args) { const q = args.join(' ').trim(); if (!q) return send(sock, message, '⚡ Element name/symbol do.'); try { const answer = await askAI(`Give verified basic periodic-table facts for ${q}: name, symbol, atomic number, atomic mass, group, period, category.`); return send(sock, message, wrap('ELEMENT', answer)); } catch (error) { return send(sock, message, `❌ Element lookup unavailable: ${error.message}`); } }
  },
  {
    command: 'periodic', aliases: [], category: 'study', description: 'Show periodic-table help', usage: '.periodic',
    async handler(sock, message) { return send(sock, message, '⚛️ *PERIODIC TABLE*\n\nUse `.element Fe`, `.element oxygen` or `.element Na` for verified basic element details.\n\nCategories: metals, nonmetals, metalloids, noble gases.'); }
  },
  {
    command: 'book', aliases: [], category: 'study', description: 'Search legal Open Library metadata', usage: '.book <query>',
    async handler(sock, message, args) {
      const q = args.join(' ').trim(); if (!q) return send(sock, message, '⚡ Book title/author do.');
      try { const { data } = await axios.get(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5`, { timeout: 12000 }); const rows = (data.docs || []).slice(0, 5).map((b, i) => `${i + 1}. *${b.title || 'Untitled'}*\n   Author: ${(b.author_name || ['Unknown']).slice(0, 2).join(', ')}\n   Year: ${b.first_publish_year || 'N/A'}\n   🔗 https://openlibrary.org${b.key || ''}`); return send(sock, message, wrap('BOOK SEARCH', rows.join('\n\n') || 'No books found.')); } catch (error) { return send(sock, message, `❌ Open Library unavailable: ${error.message}`); }
    }
  },
  {
    command: 'isbn', aliases: [], category: 'study', description: 'Lookup ISBN metadata', usage: '.isbn <isbn>',
    async handler(sock, message, args) {
      const isbn = String(args[0] || '').replace(/[-\s]/g, ''); if (!/^(?:\d{9}[\dX]|\d{13})$/.test(isbn)) return send(sock, message, '⚡ Valid ISBN-10/ISBN-13 do.');
      try { const { data } = await axios.get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { timeout: 12000 }); const b = data[`ISBN:${isbn}`]; if (!b) return send(sock, message, '❌ ISBN record nahi mila.'); return send(sock, message, wrap('ISBN LOOKUP', `Title: ${b.title || 'N/A'}\nAuthors: ${(b.authors || []).map(x => x.name).join(', ') || 'N/A'}\nPublishers: ${(b.publishers || []).map(x => x.name).join(', ') || 'N/A'}\nPages: ${b.number_of_pages || 'N/A'}\n🔗 ${b.url || `https://openlibrary.org/isbn/${isbn}`}`)); } catch (error) { return send(sock, message, `❌ ISBN lookup unavailable: ${error.message}`); }
    }
  },
  {
    command: 'doi', aliases: [], category: 'study', description: 'Lookup DOI metadata', usage: '.doi <doi>',
    async handler(sock, message, args) { const doi = String(args[0] || '').replace(/^https?:\/\/doi.org\//i, ''); if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) return send(sock, message, '⚡ Valid DOI do, example: .doi 10.1038/s41586-020-2649-2'); try { const { data } = await axios.get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { timeout: 12000, headers: { 'User-Agent': 'ABIX-AE study tool' } }); const x = data.message; return send(sock, message, wrap('DOI METADATA', `Title: ${(x.title || ['N/A'])[0]}\nAuthors: ${(x.author || []).map(a => `${a.given || ''} ${a.family || ''}`).join(', ') || 'N/A'}\nJournal: ${x['container-title']?.[0] || 'N/A'}\nPublished: ${x.published?.['date-parts']?.[0]?.join('-') || 'N/A'}\nDOI: https://doi.org/${doi}`)); } catch (error) { return send(sock, message, `❌ DOI metadata unavailable: ${error.message}`); } }
  }
];

module.exports = commands;
