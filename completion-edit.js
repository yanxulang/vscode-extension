const vscode = require("vscode");
const { romanize } = require("./symbol-index");

function completionLabel(item) {
  if (!item) return "";
  if (typeof item.label === "string") return item.label;
  return item.label?.label || "";
}

function indexedInsertText(symbol) {
  if (!["function", "method"].includes(symbol.kind)) return symbol.name;
  const parameters = symbol.parameters ?? [];
  if (!parameters.length) return `${symbol.name}（）`;
  const placeholders = parameters.map((parameter, index) => `\${${index + 1}:${parameter.name}}`);
  return `${symbol.name}（${placeholders.join("，")}）`;
}

function indexedCompletionSymbols(index, document, position) {
  if (!index) return [];
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  const memberMatch = linePrefix.match(/([^\s（）()【】\[\]{}，,:：.；;"“”「」]+)\s*\.\s*[^\s（）()【】\[\]{}，,:：.；;"“”「」]*$/);
  if (/标准\s*[:：][^」”"]*$/.test(linePrefix)) return index.standardModuleSymbols();
  if (memberMatch) return index.membersForQualifier(document.uri.toString(), memberMatch[1], position.line);
  return index.completionSymbols(document.uri.toString(), position.line, true);
}

function enrichCompletionResult(result, document, position, index, pinyinEnabled) {
  const items = Array.isArray(result) ? result : result?.items;
  if (!items) return result;
  const byName = new Map(indexedCompletionSymbols(index, document, position).map((symbol) => [symbol.name, symbol]));
  for (const item of items) {
    const label = completionLabel(item);
    if (!label) continue;
    if (pinyinEnabled) {
      const search = romanize(label).filterText;
      item.filterText = [...new Set([item.filterText, search].filter(Boolean))].join(" ");
    }
    const symbol = byName.get(label);
    if (!symbol || item.insertText || !["function", "method"].includes(symbol.kind)) continue;
    item.insertText = new vscode.SnippetString(indexedInsertText(symbol));
  }
  return result;
}

module.exports = {
  completionLabel,
  enrichCompletionResult,
  indexedCompletionSymbols,
  indexedInsertText
};
