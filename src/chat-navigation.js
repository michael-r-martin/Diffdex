// Use projected, displayable reviews so every listed chat has a real jump target.
function chatNavigationItems(sessions, documents) {
  return sessions.flatMap(session => {
    const files = [...new Set(documents.filter(doc =>
      doc.reviewKey.startsWith(`${session.key}:`) && !doc.warning && !doc.detached && doc.hunks.length
    ).map(doc => doc.uri))].sort();
    return files.length ? [{ key: session.key, title: session.title, files, warnings: session.reviewSummary?.warnings || 0 }] : [];
  });
}
module.exports = { chatNavigationItems };
