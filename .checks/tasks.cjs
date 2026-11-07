function labelNames(labels) {
  return (labels || []).map(label => typeof label === 'string' ? label : label.name);
}

function triage(input) {
  const labels = labelNames(input.issue.labels);
  const eligible = input.assignee?.login === 'Copilot'
    && labels.includes('ai-fix-requested') && !labels.includes('triage/accepted');
  return { actions: eligible ? [{ kind: 'add_labels', issue: input.issue.number, labels: ['triage/accepted', 'ai-processing'] }] : [] };
}


module.exports = { triage };
