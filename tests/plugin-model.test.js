const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { codeLensesFor, looksLikeTest } = require("../codelens-model");
const { DIAGNOSTIC_PATTERNS, parseDiagnostics } = require("../diagnostics");
const { importLinkRanges } = require("../import-links");
const {
  compatibilityDirectory,
  findManifestDirectory,
  hasManifest,
  testDirectory
} = require("../project");
const { TEMPLATES, templateById } = require("../templates");
const { matchingCase, parseTestReport } = require("../test-report");
const { parseVersionReport } = require("../version-report");

test("诊断解析保留文件、行列和 Windows 路径", () => {
  const diagnostics = parseDiagnostics([
    "类型有误：变量“甲”的类型不匹配",
    "  --> C:\\work\\示例.yx:3:5",
    "  |",
    "3 | 令 甲：文 为 1；",
    "警告[YXD001] demo.yx:2:4：标准模块名 csv 的小写兼容别名已弃用；请改为“标准:CSV”（预计 2.0.0 移除）"
  ].join("\n"));
  assert.deepEqual(diagnostics[0], {
    severity: "error",
    code: "",
    file: "C:\\work\\示例.yx",
    line: 3,
    column: 5,
    message: "类型有误：变量“甲”的类型不匹配"
  });
  assert.equal(diagnostics[1].severity, "warning");
  assert.equal(diagnostics[1].code, "YXD001");
  assert.equal(diagnostics[1].file, "demo.yx");
  assert.match(DIAGNOSTIC_PATTERNS.span.location, /-->/);
});

test("测试报告从混杂输出中取出用例", () => {
  const report = parseTestReport(`注意\n${JSON.stringify({
    tests: [{ path: path.resolve("/tmp/通过.yx"), passed: true, status: "passed", detail: "执行成功", duration_ms: 4 }]
  })}`);
  assert.equal(matchingCase(report, path.resolve("/tmp/通过.yx")).detail, "执行成功");
  assert.equal(parseTestReport("没有 JSON"), undefined);
});

test("导入链接指向引号内的模块路径", () => {
  const text = '引「标准:数学」为 数学；\n引"../模块.yx"为 模块；\n';
  const links = importLinkRanges(text, [
    { source: "标准:数学", line: 0, target: "yanxu-stdlib:/数学.yx" },
    { source: "../模块.yx", line: 1, target: "file:///tmp/模块.yx" }
  ]);
  assert.equal(text.split("\n")[0].slice(links[0].start, links[0].end), "标准:数学");
  assert.equal(text.split("\n")[1].slice(links[1].start, links[1].end), "../模块.yx");
});

test("代码透镜在普通文卷和规格文卷上区分测试", () => {
  assert.deepEqual(codeLensesFor("言 1；\n", "/tmp/主.yx").map(({ command }) => command), [
    "yanxu.runFile",
    "yanxu.startDebugging",
    "yanxu.checkFile"
  ]);
  assert.equal(codeLensesFor("言 1；\n", "/tmp/主.yx", false).length, 0);
  assert.equal(looksLikeTest("// 期：1\n言 1；\n", "/tmp/主.yx"), true);
  assert.equal(looksLikeTest("言 1；\n", "/work/spec/示例.yx"), true);
  assert.equal(codeLensesFor("// 预败：空\n", "/tmp/主.yx").at(-1).command, "yanxu.runCurrentTest");
});

test("文卷模板可以按标识取出", () => {
  assert.equal(new Set(TEMPLATES.map(({ id }) => id)).size, TEMPLATES.length);
  assert.match(templateById("test").body, /期：/);
  assert.match(templateById("gui").body, /言窗/);
  assert.equal(templateById("missing"), undefined);
});

test("清单查找停在工作区边界", () => {
  const workspace = path.resolve("/work");
  const nested = path.resolve("/work/app");
  const files = new Set([
    path.join(path.dirname(workspace), "言序.toml"),
    path.join(nested, "言序.toml")
  ]);
  const exists = (file) => files.has(file);
  assert.equal(findManifestDirectory(path.join(nested, "src"), exists, workspace), nested);
  assert.equal(findManifestDirectory(path.join(workspace, "other"), exists, workspace), undefined);
  assert.equal(hasManifest(nested, exists), true);
  assert.equal(hasManifest(workspace, exists), false);
});

test("测试目录优先使用 spec", () => {
  const nested = path.resolve("/work/app");
  const loose = path.resolve("/work/loose");
  const files = new Set([path.join(nested, "言序.toml"), path.join(nested, "spec")]);
  const exists = (file) => files.has(file);
  assert.equal(testDirectory(nested, exists), path.join(nested, "spec"));
  assert.equal(testDirectory(loose, exists), loose);
  assert.equal(compatibilityDirectory(nested, exists), path.join(nested, "compat"));
});

test("版本握手读取 version 字段", () => {
  assert.equal(parseVersionReport('日志\n{"version":"1.1.20","schema_version":2}\n').version, "1.1.20");
  assert.equal(parseVersionReport("言序 1.1.20"), undefined);
});
