const insights = $('Check Insights').first().json;
const pulseNode = $('Check Pulse').first().json;
const fee = $json;

const topThemes = Array.isArray(insights.top_themes) ? insights.top_themes : [];
if (topThemes.length !== 3) {
  throw new Error('top_themes must have exactly 3 entries; found ' + topThemes.length + '.');
}

const weeklyPulse = String(pulseNode.pulse ?? '').trim();
if (!weeklyPulse) {
  throw new Error('Check Pulse did not produce a pulse text.');
}

const issueTitle = String((insights.fee_issue && insights.fee_issue.title) || '').trim();
const issueDescription = String((insights.fee_issue && insights.fee_issue.description) || '').trim();
const identifiedFeeIssue =
  issueTitle && issueDescription ? issueTitle + ' - ' + issueDescription : issueTitle || issueDescription;
if (!identifiedFeeIssue) {
  throw new Error('The identified fee issue is empty; check the fee_issue fields in Check Insights.');
}

if (!Array.isArray(fee.bullets) || fee.bullets.length === 0) {
  throw new Error('Check Fee did not return explanation bullets.');
}
if (!Array.isArray(fee.source_links) || fee.source_links.length !== 2) {
  throw new Error('Check Fee did not return exactly 2 source links.');
}

const payload = {
  date: $now.toFormat('yyyy-MM-dd'),
  top_themes: topThemes,
  weekly_pulse: weeklyPulse,
  identified_fee_issue: identifiedFeeIssue,
  explanation_bullets: fee.bullets.map((bullet) => String(bullet)),
  source_links: fee.source_links.map((link) => String(link)),
  last_checked: String(fee.last_checked ?? '').trim(),
};

return [{ json: payload }];
