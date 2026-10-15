'use strict';
// iLovePDF: PDF Forms — list, fill and flatten AcroForm fields.
const { fs, loadPdf, savePdf } = require('../lib/util.cjs');

module.exports = {
  command: 'forms <input> [data]',
  description: 'List/fill/flatten PDF form fields (iLovePDF: PDF Forms)',
  options: [
    ['-o, --output <path>', 'Output PDF path (fill/flatten)', 'form-filled.pdf'],
    ['--fill <json>', 'JSON file or inline JSON mapping field name -> value', null],
    ['--flatten', 'Flatten form fields into static content'],
    ['--list', 'List field names and types'],
  ],
  action: async (input, data, opts) => {
    opts = opts || {};
    const doc = await loadPdf(input);
    const form = doc.getForm();
    const fields = form.getFields();
    if (opts.list || (!opts.fill && !opts.flatten)) {
      if (!fields.length) return 'No form fields found.';
      return fields.map(f => `${f.getName()} [${f.constructor.name.replace('PDF', '').replace('Field', '')}]`).join('\n');
    }
    if (opts.fill) {
      const fillArg = opts.fill === true ? data : opts.fill;
      let map;
      try { map = JSON.parse(fillArg); }
      catch { map = JSON.parse(fs.readFileSync(fillArg, 'utf8')); }
      for (const [name, value] of Object.entries(map)) {
        try {
          const f = form.getField(name);
          const kind = f.constructor.name;
          if (kind.includes('TextField')) f.setText(String(value));
          else if (kind.includes('CheckBox')) { value ? f.check() : f.uncheck(); }
          else if (kind.includes('Dropdown') || kind.includes('OptionList')) f.select(String(value));
          else if (kind.includes('RadioGroup')) f.select(String(value));
        } catch (e) { console.warn(`  ! field "${name}": ${e.message}`); }
      }
    }
    if (opts.flatten) form.flatten();
    await savePdf(doc, opts.output);
    return `Form ${opts.flatten ? 'flattened' : 'filled'} -> ${opts.output}`;
  },
};
