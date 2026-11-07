const fs = require('node:fs');
const REQUIRED_LABELS = ['ai-fix-requested', 'triage/accepted'];
const BLOCKING_LABELS = ['ai-awaiting-fix', 'ai-processing', 'ai-pr-draft', 'ai-pr-ready'];
const AGENT_ALIASES = ['copilot-swe-agent[bot]', 'github-copilot-enterprise[bot]', 'github-copilot[bot]', 'copilot-swe-agent', 'github-copilot-enterprise', 'github-copilot'];
function plan(issue) {
  if (!issue || issue.pull_request || issue.state !== 'open') return {action:'skip', reason:'not_open_issue'};
  if (!Array.isArray(issue.labels) || !Array.isArray(issue.assignees)) throw Error('Incomplete issue metadata');
  const labels = new Set(issue.labels.map(x => typeof x === 'string' ? x : x.name));
  if (!REQUIRED_LABELS.every(x => labels.has(x))) return {action:'skip', reason:'missing_required_label'};
  if (BLOCKING_LABELS.some(x => labels.has(x))) return {action:'skip', reason:'in_progress'};
  if (issue.assignees.some(x => AGENT_ALIASES.includes(x.login))) return {action:'label', label:'ai-processing', reason:'already_assigned'};
  return {action:'assign_then_label', agent:'copilot', label:'ai-processing'};
}
async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== 'mohanad-hafez/console-checks') throw Error('Unexpected target');
  const number = Number(process.env.CHECK_ISSUE);
  if (!Number.isSafeInteger(number) || number < 1) throw Error('Invalid issue');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw Error('Missing Actions credential');
  const headers = {Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'};
  const requests = [];
  async function read(path) {
    const response = await fetch('https://api.github.com/'+path, {headers, signal:AbortSignal.timeout(30000), redirect:'error'});
    requests.push({path, status:response.status});
    return response;
  }
  const response = await read(`repos/${repository}/issues/${number}`);
  if (!response.ok) throw Error('Issue read failed '+response.status);
  const raw = await response.json();
  const issue = {number:raw.number, state:raw.state, labels:raw.labels.map(x=>x.name), assignees:raw.assignees.map(x=>({login:x.login})), ...(raw.pull_request ? {pull_request:true} : {})};
  if (issue.labels.length || issue.assignees.length || issue.state !== 'open') throw Error('Probe fixture changed');
  const capabilities = [];
  for (const alias of AGENT_ALIASES) {
    const r = await read(`repos/${repository}/issues/${number}/assignees/${encodeURIComponent(alias)}`);
    capabilities.push({alias,status:r.status,assignable:r.status===204});
    // Consume no unrelated response bodies. Any auth/transport ambiguity is a distinct failure.
    if (![204,404].includes(r.status)) throw Error('Capability inspection failed '+r.status);
  }
  const receipt = {schema:1, repository, issue, guard_result:plan(issue), capabilities, requests, assignment_requests:0, label_requests:0, model_calls:0, status:capabilities.some(x=>x.assignable)?'capability_available_requires_frozen_handoff_plan':'handoff_unavailable_with_actions_credential', scope:'Read-only capability preflight; not a completed replacement or downstream-worker evaluation'};
  fs.writeFileSync('assignment-probe.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,requests:requests.length,writes:0}));
}
if (require.main === module) main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports = {plan, REQUIRED_LABELS, BLOCKING_LABELS, AGENT_ALIASES};
