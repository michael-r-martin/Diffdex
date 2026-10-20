function chatPickerItems(sessions, selected) {
  return sessions.map(s => {
    const { files = 0, warnings = 0 } = s.reviewSummary || {};
    const icon = warnings ? 'warning' : files ? 'diff' : 'check';
    const summary = [files ? `${files} file${files === 1 ? '' : 's'} ready to review` : warnings ? '0 ready to review' : 'Caught up', warnings ? `${warnings} unresolved file${warnings === 1 ? '' : 's'}` : '', s.key === selected ? 'Selected' : ''].filter(Boolean).join(' · ');
    return { label: `$(${icon}) ${s.title}`, description: summary, key: s.key };
  });
}
module.exports = { chatPickerItems };
