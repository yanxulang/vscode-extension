const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SymbolIndex,
  callAt,
  matchesSymbol,
  parseDocument,
  resolveImportCandidates,
  romanize,
  stripGeneric,
} = require("../symbol-index");
const standardLibrary = require("../resources/standard-library.json");

test("解析并索引用户定义的全部声明种类", () => {
  const parsed = parseDocument(`/// 外部订单模块
公 类 订单 承 基础订单 则
    公 域 金额：数；
    私 域 备注：文；
    公 异 法 计算总和（折扣：数，说明：文）：数 则
        令 临时结果：数 = 0；
        定 税率：数 = 1；
    终
终

公 协 可保存 则
    公 法 保存（）：理；
终

公 法 创建订单（金额：数）：订单 则
    令 新订单：订单；
终
`, "file:///orders.yx", "/workspace/orders.yx");

  const named = (name, kind) => parsed.symbols.find((symbol) => symbol.name === name && (!kind || symbol.kind === kind));
  assert.equal(named("订单").kind, "class");
  assert.equal(named("订单").extends, "基础订单");
  assert.equal(named("订单").documentation, "外部订单模块");
  assert.equal(named("金额", "field").kind, "field");
  assert.equal(named("备注").exported, false);
  assert.equal(named("计算总和").kind, "method");
  assert.equal(named("计算总和").parameters.length, 2);
  assert.equal(named("折扣").kind, "parameter");
  assert.equal(named("临时结果").kind, "variable");
  assert.equal(named("税率").kind, "constant");
  assert.equal(named("可保存").kind, "interface");
  assert.equal(named("创建订单").kind, "function");
  assert.equal(named("新订单").type, "订单");
});

test("全拼和首字母都能匹配中文符号", () => {
  const search = romanize("计算总和");
  assert.equal(search.full, "jisuanzonghe");
  assert.equal(search.initials, "jszh");
  const symbol = { name: "计算总和", pinyin: search.full, initials: search.initials };
  assert.equal(matchesSymbol(symbol, "jisuan"), true);
  assert.equal(matchesSymbol(symbol, "jszh"), true);
  assert.equal(matchesSymbol(symbol, "zonghe"), true);
  assert.equal(matchesSymbol(symbol, "不存在"), false);
});

test("成员类型解析支持可空、联合与模块限定名称", () => {
  assert.equal(stripGeneric("订单?"), "订单");
  assert.equal(stripGeneric("订单|空"), "订单");
  assert.equal(stripGeneric("领域.订单"), "订单");
  assert.equal(stripGeneric("列<订单>"), "列");
});

test("索引标准库、外部模块导出、类成员与继承成员", () => {
  const index = new SymbolIndex(standardLibrary);
  const baseUri = "file:///outside/base.yx";
  const moduleUri = "file:///outside/orders.yx";
  const mainUri = "file:///workspace/main.yx";
  index.updateDocument(baseUri, `公 类 基础订单 则
    公 法 保存（）：理 则
    终
终
`, "/outside/base.yx");
  index.updateDocument(moduleUri, `公 类 订单 承 基础订单 则
    公 域 金额：数；
    公 法 计算总和（折扣：数）：数 则
    终
终
公 法 创建订单（金额：数）：订单 则
终
私 法 内部函数（）：空 则
终
`, "/outside/orders.yx");
  index.updateDocument(mainUri, `引「../outside/orders.yx」为 订单库；
引「标准:数学」为 数学；
令 当前订单：订单；
订单库.创建订单（1）；
当前订单.计算总和（1）；
`, "/workspace/main.yx");
  index.setImportTarget(mainUri, "../outside/orders.yx", moduleUri);

  assert.deepEqual(
    index.membersForQualifier(mainUri, "订单库", 3).map((symbol) => symbol.name).sort(),
    ["创建订单", "订单"],
  );
  assert.equal(index.membersForQualifier(mainUri, "订单库", 3).some(({ name }) => name === "内部函数"), false);
  assert.equal(index.membersForQualifier(mainUri, "数学", 3).some(({ name }) => name === "圆周率"), true);
  const instanceMembers = index.membersForQualifier(mainUri, "当前订单", 4).map(({ name }) => name);
  assert.ok(instanceMembers.includes("计算总和"));
  assert.ok(instanceMembers.includes("金额"));
  assert.ok(instanceMembers.includes("保存"));
  assert.equal(index.definitions(mainUri, "创建订单", "订单库", 3)[0].uri, moduleUri);
});

test("局部变量只在所属函数中参与补全和定义", () => {
  const uri = "file:///scope.yx";
  const index = new SymbolIndex();
  index.updateDocument(uri, `法 第一（参数甲：数）：数 则
    令 局部甲：数 = 1；
    归 局部甲；
终
法 第二（参数乙：数）：数 则
    令 局部乙：数 = 2；
    归 局部乙；
终
`, "/scope.yx");

  const first = index.completionSymbols(uri, 2).map(({ name }) => name);
  assert.ok(first.includes("参数甲"));
  assert.ok(first.includes("局部甲"));
  assert.equal(first.includes("局部乙"), false);
  assert.equal(index.definitions(uri, "局部乙", "", 2).length, 0);
});

test("工作区符号支持拼音查询并包含标准库", () => {
  const index = new SymbolIndex(standardLibrary);
  index.updateDocument("file:///demo.yx", "公 法 计算总和（）：数 则\n终\n", "/demo.yx");
  assert.ok(index.workspaceSymbols("jszh").some(({ name }) => name === "计算总和"));
  assert.ok(index.workspaceSymbols("sx").some(({ name }) => name === "数学"));
});

test("识别成员调用参数位置并解析外部模块候选路径", () => {
  assert.deepEqual(callAt("订单库.创建订单（总额，"), {
    qualifier: "订单库",
    name: "创建订单",
    activeParameter: 1,
  });
  const candidates = resolveImportCandidates("/workspace/src/main.yx", "../lib/orders");
  assert.ok(candidates.includes("/workspace/lib/orders.yx"));
  assert.ok(candidates.includes("/workspace/lib/orders/主.yx"));
});

test("单行函数不会污染后续声明的作用域", () => {
  const parsed = parseDocument(`类 工具 则
    公 法 一（）：数 则 归 1；终
终
公 法 二（）：数 则
    令 局部：数 为 2；
终
`, "file:///inline.yx", "/inline.yx");
  const second = parsed.symbols.find(({ name }) => name === "二");
  assert.equal(second.kind, "function");
  assert.equal(second.container, "");
});

test("条件、循环和错误处理块不会提前结束函数作用域", () => {
  const uri = "file:///nested-blocks.yx";
  const index = new SymbolIndex();
  index.updateDocument(uri, `法 处理（输入：数）：数 则
    若 输入 大于 0 则
        令 分支值：数 为 输入；
    终
    试 则
        令 尝试值：数 为 输入；
    救 所误 则
        令 错误值：数 为 0；
    终
    令 最终值：数 为 输入；
    归 最终值；
终
`, "/nested-blocks.yx");
  const result = index.completionSymbols(uri, 10).map(({ name }) => name);
  assert.ok(result.includes("输入"));
  assert.ok(result.includes("最终值"));
  assert.equal(index.definitions(uri, "最终值", "", 10)[0].container, "处理");
});

test("嵌套函数可以补全外层闭包参数但不会泄漏到其他函数", () => {
  const uri = "file:///closure.yx";
  const index = new SymbolIndex();
  index.updateDocument(uri, `法 造加法（甲：数）：法 则
    法 加（乙：数）：数 则
        归 甲 加 乙；
    终
    归 加；
终
法 其他（）：空 则
    言「完成」；
终
`, "/closure.yx");
  const nested = index.completionSymbols(uri, 2).map(({ name }) => name);
  assert.ok(nested.includes("甲"));
  assert.ok(nested.includes("乙"));
  const other = index.completionSymbols(uri, 8).map(({ name }) => name);
  assert.equal(other.includes("甲"), false);
  assert.equal(other.includes("乙"), false);
});
