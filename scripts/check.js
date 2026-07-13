const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const jsonFiles = [
  "package.json",
  "language-configuration.json",
  "syntaxes/yanxu.tmLanguage.json",
  "snippets/yanxu.json"
];

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const grammar of manifest.contributes.grammars) {
  if (!fs.existsSync(path.join(root, grammar.path))) throw new Error(`找不到语法文件：${grammar.path}`);
}
for (const snippets of manifest.contributes.snippets) {
  if (!fs.existsSync(path.join(root, snippets.path))) throw new Error(`找不到片段文件：${snippets.path}`);
}
console.log("言序 VS Code 扩展结构有效。");
