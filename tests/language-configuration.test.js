const test = require("node:test");
const assert = require("node:assert/strict");
const configuration = require("../language-configuration.json");

const indentation = Object.fromEntries(
  Object.entries(configuration.indentationRules)
    .filter(([name]) => name.endsWith("Pattern"))
    .map(([name, pattern]) => [name, new RegExp(pattern)])
);

test("言序块声明增加缩进", () => {
  for (const line of ["若 条件 则", "公 法 求和（甲：数）则", "异 法 获取（）则", "协 可显示 则", "救 所误 则"]) {
    assert.match(line, indentation.increaseIndentPattern);
  }
});

test("中间分支和终止符减少缩进", () => {
  for (const line of ["否则", "救 所误 则", "终"]) {
    assert.match(line, indentation.decreaseIndentPattern);
  }
});

test("回车规则覆盖块结构和文档注释", () => {
  const [blockPair, block, documentation] = configuration.onEnterRules;
  assert.match("类 示例 则", new RegExp(block.beforeText));
  assert.match("终", new RegExp(blockPair.afterText));
  assert.match("/// 说明", new RegExp(documentation.beforeText));
  assert.equal(documentation.action.appendText, "/// ");
});

test("自动闭合允许换行和制表符", () => {
  assert.ok(configuration.autoCloseBefore.includes("\n"));
  assert.ok(configuration.autoCloseBefore.includes("\t"));
});
