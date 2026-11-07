const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const tasks = require('./tasks.cjs');
const file = process.argv[2];
const raw = fs.readFileSync(file);
const suite = JSON.parse(raw);
const results = [];
for (const record of suite.cases) {
  const started = process.hrtime.bigint();
  let output, error;
  try {
    output = tasks[suite.task](record.input);
    const expected = record.expected;
    if (expected.actions) assert.deepEqual(output.actions, expected.actions);
    if (expected.action_kinds) assert.deepEqual(output.actions.map(action => action.kind), expected.action_kinds);
    if (expected.affected_issues) assert.deepEqual([...new Set(output.actions.map(action => action.issue))], expected.affected_issues);
    if (expected.action_count !== undefined) assert.equal(output.actions.length, expected.action_count);
    if (expected.counts) assert.deepEqual(output.counts, expected.counts);
    if (expected.nanos !== undefined) assert.equal(output.totals?.nanos ?? null, expected.nanos);
    if (expected.formatted) assert.equal(output.totals.formatted, expected.formatted);
    if (expected.models) assert.equal(output.totals.models, expected.models);
    if (expected.first_kind) assert.equal(output.actions[0].kind, expected.first_kind);
    if (expected.target_issue) assert.equal(output.actions[0].issue, expected.target_issue);
    for (const text of expected.body_contains || []) assert.ok(output.actions[0].body.includes(text), 'Missing report content ' + text);
  } catch (failure) { error = String(failure); }
  results.push({ id: record.id, partition: record.partition, success: !error, elapsed_ms: Number(process.hrtime.bigint() - started) / 1e6, error, output });
}
const summary = {
  example: suite.id, task: suite.task, phase: 'source_bound_contract_validation', paired_comparison: false,
  case_count: results.length, passed: results.filter(result => result.success).length,
  cases_sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  implementation_sha256: crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./tasks.cjs'))).digest('hex'),
  agent_baseline: 'not_run', model_calls: 0, results,
  github_run_id: process.env.GITHUB_RUN_ID || null, github_sha: process.env.GITHUB_SHA || null,
  platform: process.platform, node: process.version,
};
const output = process.argv[3] || 'results.json';
fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ example: suite.id, passed: summary.passed, total: summary.case_count, phase: summary.phase, paired_comparison: false }));
if (summary.passed !== summary.case_count) process.exitCode = 1;
