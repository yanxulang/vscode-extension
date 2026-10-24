const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const jsonFiles = [
  "package.json",
  "language-configuration.json",
  "syntaxes/yanxu.tmLanguage.json",
  "snippets/yanxu.json",
  "resources/standard-library.json"
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
for (const binding of manifest.contributes.keybindings ?? []) {
  if (!commands.includes(binding.command)) throw new Error(`快捷键引用了未声明命令：${binding.command}`);
}

const sourceFiles = fs.readdirSync(root).filter((name) => name.endsWith(".js"));
if (!sourceFiles.includes("extension.js")) throw new Error("缺少扩展入口");
const source = sourceFiles.map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
for (const file of sourceFiles) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
}
for (const command of commands) {
  if (!source.includes(`registerCommand("${command}"`)) {
    throw new Error(`扩展入口未注册命令：${command}`);
  }
}
if (!source.includes('registerDebugAdapterDescriptorFactory("yanxu"')) {
  throw new Error("扩展入口未注册言序调试适配器");
}
if (!source.includes('registerTerminalProfileProvider("yanxu.repl"')) {
  throw new Error("扩展入口未注册言序 REPL 终端配置");
}
for (const provider of [
  "registerCompletionItemProvider",
  "registerHoverProvider",
  "registerSignatureHelpProvider",
  "registerDefinitionProvider",
  "registerWorkspaceSymbolProvider",
  "registerDocumentLinkProvider",
  "registerCodeLensProvider",
  "registerCodeActionsProvider"
]) {
  if (!source.includes(`vscode.languages.${provider}`)) {
    throw new Error(`扩展入口未注册语言功能：${provider}`);
  }
}
if (!source.includes('registerTextDocumentContentProvider("yanxu-stdlib"')) {
  throw new Error("扩展入口未注册标准库虚拟文卷提供器");
}
if (!source.includes('createTestController("yanxu"')) {
  throw new Error("扩展入口未注册规格测试控制器");
}
const { DIAGNOSTIC_PATTERNS } = require(path.join(root, "diagnostics.js"));
const matchers = Object.fromEntries((manifest.contributes.problemMatchers ?? []).map((matcher) => [matcher.name, matcher]));
const span = matchers.yanxu?.pattern;
const deprecation = matchers["yanxu-deprecation"]?.pattern;
if (!Array.isArray(span) || span[0]?.regexp !== DIAGNOSTIC_PATTERNS.span.message || span[1]?.regexp !== DIAGNOSTIC_PATTERNS.span.location) {
  throw new Error("言序诊断问题匹配器与 diagnostics.js 不一致");
}
if (deprecation?.regexp !== DIAGNOSTIC_PATTERNS.deprecation) {
  throw new Error("言序弃用问题匹配器与 diagnostics.js 不一致");
}
const taskCommands = new Set(manifest.contributes.taskDefinitions?.find((item) => item.type === "yanxu")?.properties?.command?.enum ?? []);
const { TASK_COMMANDS } = require(path.join(root, "yanxu-commands.js"));
for (const command of Object.keys(TASK_COMMANDS)) {
  if (!taskCommands.has(command)) throw new Error(`任务定义缺少 ${command}`);
}
if (!manifest.dependencies?.["pinyin-pro"]) {
  throw new Error("package.json 缺少拼音补全依赖");
}
const standardLibrary = JSON.parse(fs.readFileSync(path.join(root, "resources/standard-library.json"), "utf8"));
if (!Array.isArray(standardLibrary.modules) || standardLibrary.modules.length !== 25) {
  throw new Error("内置标准库索引不完整");
}
if (standardLibrary.coreVersion !== "1.1.7") {
  throw new Error(`内置标准库索引对应 ${standardLibrary.coreVersion || "未知"}，预期言序 1.1.7`);
}
for (const moduleName of ["进程", "资源"]) {
  if (!standardLibrary.modules.some(({ name }) => name === moduleName)) {
    throw new Error(`内置标准库索引缺少 ${moduleName} 模块`);
  }
}
console.log("言序 VS Code 扩展结构有效。");
