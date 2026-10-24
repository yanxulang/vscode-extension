function looksLikeTest(text, filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  if (/(^|\/)spec\//.test(normalized)) return true;
  return /(^|\n)\s*(?:\/\/|#)\s*(?:期：|预败)/.test(String(text || ""));
}

function codeLensesFor(text, filePath, enabled = true) {
  if (!enabled) return [];
  const lenses = [
    { title: "运行", command: "yanxu.runFile", line: 0 },
    { title: "调试", command: "yanxu.startDebugging", line: 0 },
    { title: "检查", command: "yanxu.checkFile", line: 0 }
  ];
  if (looksLikeTest(text, filePath)) {
    lenses.push({ title: "运行测试", command: "yanxu.runCurrentTest", line: 0 });
  }
  return lenses;
}

module.exports = { codeLensesFor, looksLikeTest };
