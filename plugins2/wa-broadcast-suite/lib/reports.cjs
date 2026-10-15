// Campaign + survey reporting: Excel workbooks and chat-friendly summaries.
const path = require('path');
const { saveExcel, stamp } = require('./util.cjs');

function campaignReportXlsx(campaign, outDir) {
  const s = campaign.summary();
  const file = path.join(outDir, `campaign-${campaign.id}-report-${stamp()}.xlsx`);
  saveExcel(file, {
    Summary: [{ ...s }],
    Details: campaign.reportRows(),
  });
  return file;
}

function campaignTextSummary(campaign) {
  const s = campaign.summary();
  return [
    `Campaign ${s.id} — ${s.status}`,
    `Total: ${s.total} | Sent: ${s.sent} | Delivered: ${s.delivered} | Read: ${s.read} | Failed: ${s.failed} | Pending: ${s.pending}`,
  ].join('\n');
}

function surveyReportXlsx(survey, outDir) {
  const file = path.join(outDir, `survey-${survey.id}-report-${stamp()}.xlsx`);
  saveExcel(file, { Tally: survey.tally(), Answers: survey.reportRows() });
  return file;
}

module.exports = { campaignReportXlsx, campaignTextSummary, surveyReportXlsx };
