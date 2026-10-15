'use strict';
// iLovePDF: Workflows — chain tools together from a JSON workflow file.
// Example workflow.json:
// {
//   "steps": [
//     { "tool": "compress", "input": "a.pdf", "output": "a-small.pdf" },
//     { "tool": "watermark", "input": "a-small.pdf", "output": "a-final.pdf", "options": { "text": "DRAFT" } }
//   ]
// }
const { fs } = require('../lib/util.cjs');

module.exports = {
  command: 'workflow <file>',
  description: 'Run a multi-tool workflow from JSON (iLovePDF: Create a workflow)',
  options: [],
  action: async (file) => {
    const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(wf.steps)) throw new Error('Workflow JSON needs a "steps" array.');
    const registry = require('../index.cjs');
    const log = [];
    for (let i = 0; i < wf.steps.length; i++) {
      const s = wf.steps[i];
      const tool = registry[s.tool];
      if (!tool) throw new Error(`Step ${i + 1}: unknown tool "${s.tool}"`);
      const inputs = Array.isArray(s.input) ? s.input : [s.input].filter(Boolean);
      const opts = { ...(s.options || {}) };
      if (s.output && !opts.output) opts.output = s.output;
      if (s.o && !opts.output) opts.output = s.o;
      console.log(`[${i + 1}/${wf.steps.length}] ${s.tool} ${inputs.join(' ')}`);
      const msg = await tool.action(...(tool.command.includes('<inputs...>') ? [inputs, opts] : [...inputs, opts]));
      log.push(msg);
    }
    return `Workflow complete (${wf.steps.length} steps):\n` + log.map(l => '  • ' + l).join('\n');
  },
};
