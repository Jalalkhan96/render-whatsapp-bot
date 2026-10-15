const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'ABIX-AE Bill Lookup/1.0';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseHiddenFields($) {
  const fields = {};
  $('input[type="hidden"][name]').each((_, element) => {
    const name = $(element).attr('name');
    if (name) fields[name] = $(element).attr('value') || '';
  });
  return fields;
}

function parseBillPage(html, sourceUrl) {
  const $ = cheerio.load(html);
  const fields = {};
  $('.table tr, table tr, .bill-detail tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean);
    if (cells.length >= 2) fields[cells[0].replace(/:$/, '')] = cells.slice(1).join(' ');
  });

  const text = clean($('body').text());
  const error = text.match(/(invalid|not found|does not exist|no record|unable to find|enter valid)[^.]{0,120}/i);
  if (error && Object.keys(fields).length === 0) {
    throw new Error(clean(error[0]));
  }

  const pdfLink = $('a[href*=".pdf"], a[href*="Print"], a[href*="print"]')
    .map((_, element) => $(element).attr('href')).get().find(Boolean);
  return {
    sourceUrl,
    fields,
    pdfUrl: pdfLink ? new URL(pdfLink, sourceUrl).toString() : null,
    rawTitle: clean($('title').first().text())
  };
}

async function lookupPitc(provider, reference) {
  const baseUrl = `https://bill.pitc.com.pk/${provider.toLowerCase()}bill/`;
  const client = axios.create({
    timeout: 25000,
    maxContentLength: 8 * 1024 * 1024,
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    validateStatus: status => status >= 200 && status < 400
  });
  const initial = await client.get(baseUrl);
  const $ = cheerio.load(initial.data);
  const form = $('form#SubmitForm, form').first();
  if (!form.length) throw new Error(`${provider} bill form nahi mila`);

  const action = new URL(form.attr('action') || './', baseUrl).toString();
  const payload = {
    ...parseHiddenFields($),
    rbSearchByList: 'refno',
    searchTextBox: reference,
    ruCodeTextBox: '',
    btnSearch: 'Search'
  };
  const response = await client.post(action, new URLSearchParams(payload).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: baseUrl }
  });
  return parseBillPage(response.data, action);
}

module.exports = { clean, parseBillPage, lookupPitc };
