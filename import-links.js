function importLinkRanges(text, imports) {
  const lines = String(text || "").split(/\r?\n/);
  const links = [];
  for (const item of imports || []) {
    if (!item?.source || !item.target || !Number.isInteger(item.line)) continue;
    const line = lines[item.line];
    if (line == null) continue;
    const wrappers = [`「${item.source}」`, `“${item.source}”`, `"${item.source}"`];
    let found = -1;
    for (const wrapper of wrappers) {
      found = line.indexOf(wrapper);
      if (found >= 0) break;
    }
    if (found < 0) continue;
    links.push({
      line: item.line,
      start: found + 1,
      end: found + 1 + item.source.length,
      target: item.target
    });
  }
  return links;
}

module.exports = { importLinkRanges };
