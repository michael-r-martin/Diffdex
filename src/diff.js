// Small, bounded line diff for the rendering experiment; no external dependencies.
function hunks(before, after, group = true) {
  const a = before === '' ? [] : before.replace(/\r\n/g, '\n').split('\n');
  const b = after === '' ? [] : after.replace(/\r\n/g, '\n').split('\n');
  if (a.length * b.length > 2000000) return null;
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const result = [];
  let i = 0, j = 0, current;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      current = undefined; i++; j++; continue;
    }
    if (!current) { current = { start: j, removed: [], added: [] }; result.push(current); }
    if (i < a.length && (j === b.length || rows[i + 1][j] >= rows[i][j + 1])) current.removed.push(a[i++]);
    else current.added.push(b[j++]);
  }
  // A matching brace or blank line is a poor boundary between large replacements.
  // Keep meaningful unchanged lines as anchors, but absorb short punctuation-only
  // gaps into the surrounding hunk so unrelated functions aren't visually paired.
  if (!group) return result;
  const grouped = [];
  const weak = line => /^[\s{}()[\];,]*$/.test(line);
  for (const next of result) {
    const previous = grouped[grouped.length - 1];
    const end = previous && previous.start + previous.added.length;
    const gap = previous ? b.slice(end, next.start) : [];
    if (previous && gap.length <= 3 && gap.every(weak)) {
      previous.removed.push(...gap, ...next.removed);
      previous.added.push(...gap, ...next.added);
    } else {
      grouped.push(next);
    }
  }
  return grouped;
}
module.exports = { hunks };
