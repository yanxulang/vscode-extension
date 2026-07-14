const test = require("node:test");
const assert = require("node:assert/strict");
const {
  completionEntries,
  lookupLanguageSymbol,
  signatureAt
} = require("../language-features");

test("普通位置提供关键字、类型与内建函数补全", () => {
  const labels = completionEntries("令 结果 为 ").map(({ label }) => label);
  assert.ok(labels.includes("若"));
  assert.ok(labels.includes("数"));
  assert.ok(labels.includes("长度"));
  assert.ok(labels.includes("候"));
  assert.ok(labels.includes("任务"));
  assert.ok(labels.includes("并候"));
});

test("类型标注位置只提供类型补全", () => {
  const entries = completionEntries("令 名称：");
  assert.ok(entries.some(({ label }) => label === "文"));
  assert.ok(entries.every(({ kind }) => kind === "type"));
});

test("标准库路径位置提供模块补全", () => {
  const entries = completionEntries("引「标准:");
  assert.equal(entries.length, 21);
  assert.ok(entries.some(({ label }) => label === "JSON"));
  assert.ok(entries.some(({ label }) => label === "标识"));
  for (const label of ["Base64", "正则", "URL", "日期"]) {
    assert.ok(entries.some((entry) => entry.label === label));
  }
});

test("签名提示识别参数位置与嵌套调用", () => {
  assert.deepEqual(signatureAt("追加（项目，"), {
    ...lookupLanguageSymbol("追加"),
    activeParameter: 1
  });
  assert.equal(signatureAt("映射（范围（1，10），").activeParameter, 1);
});

test("悬停词典包含文档和函数签名", () => {
  assert.equal(lookupLanguageSymbol("若").documentation, "开始条件分支");
  assert.match(lookupLanguageSymbol("范围").signature, /范围（起：数/);
});
