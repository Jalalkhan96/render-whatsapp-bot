'use strict';
/* 18+ gate. The tool does nothing until the adult running it says so.
 * Pass --i-am-18 on the command line, or set LAF_I_AM_ADULT=1. */

function check(argv) {
  const flag = argv.includes('--i-am-18') || process.env.LAF_I_AM_ADULT === '1';
  if (!flag) {
    return {
      ok: false,
      message: 'This tool searches legal adult content. You must confirm you are 18 or older.\n' +
               'Re-run with --i-am-18, or set LAF_I_AM_ADULT=1 in your environment.\n' +
               'Nothing was searched, nothing was fetched.',
    };
  }
  return { ok: true };
}

module.exports = { check };
