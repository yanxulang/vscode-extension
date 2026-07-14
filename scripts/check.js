const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## ${manifest.version}`)) {
  throw new Error(`CHANGELOG.md 缺少 ${manifest.version} 版本记录`);
}

if (!manifest.icon || path.extname(manifest.icon).toLowerCase() !== ".png") {
  throw new Error("Marketplace 图标必须是 PNG 文件");
}
const icon = fs.readFileSync(path.join(root, manifest.icon));
if (icon.toString("hex", 1, 4) !== "504e47") throw new Error("扩展图标不是有效的 PNG");
const iconWidth = icon.readUInt32BE(16);
const iconHeight = icon.readUInt32BE(20);
if (iconWidth < 128 || iconHeight < 128 || iconWidth !== iconHeight) {
  throw new Error("扩展图标必须是至少 128×128 的正方形 PNG");
}
if (!fs.existsSync(path.join(root, "images/icon.svg"))) throw new Error("缺少 SVG 图标母版");

for (const grammar of manifest.contributes.grammars) {
  if (!fs.existsSync(path.join(root, grammar.path))) throw new Error(`找不到语法文件：${grammar.path}`);
}
for (const snippets of manifest.contributes.snippets) {
  if (!fs.existsSync(path.join(root, snippets.path))) throw new Error(`找不到片段文件：${snippets.path}`);
}
if (!manifest.contributes.breakpoints?.some(({ language }) => language === "yanxu")) {
  throw new Error("package.json 未声明言序断点能力");
}
if (!manifest.contributes.debuggers?.some(({ type }) => type === "yanxu")) {
  throw new Error("package.json 未声明言序调试器");
}

const commands = manifest.contributes.commands.map(({ command }) => command);
if (new Set(commands).size !== commands.length) throw new Error("package.json 包含重复命令");
for (const items of Object.values(manifest.contributes.menus ?? {})) {
  for (const item of items) {
    if (!commands.includes(item.command)) throw new Error(`菜单引用了未声明命令：${item.command}`);
  }
}

const extensionEntry = path.join(root, "extension.js");
execFileSync(process.execPath, ["--check", extensionEntry], { stdio: "inherit" });
const extensionSource = fs.readFileSync(extensionEntry, "utf8");
for (const command of commands) {
  if (!extensionSource.includes(`registerCommand(\"${command}\"`)) {
    throw new Error(`扩展入口未注册命令：${command}`);
  }
}
if (!extensionSource.includes('registerDebugAdapterDescriptorFactory("yanxu"')) {
  throw new Error("扩展入口未注册言序调试适配器");
}
for (const provider of [
  "registerCompletionItemProvider",
  "registerHoverProvider",
  "registerSignatureHelpProvider"
]) {
  if (!extensionSource.includes(`vscode.languages.${provider}`)) {
    throw new Error(`扩展入口未注册语言功能：${provider}`);
  }
}
console.log("言序 VS Code 扩展结构有效。");
