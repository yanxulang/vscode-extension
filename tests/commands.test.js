const test = require("node:test");
const assert = require("node:assert/strict");
const { FILE_COMMANDS, TASK_COMMANDS, fileArguments, taskArguments } = require("../yanxu-commands");

test("文件命令映射到 1.0 CLI", () => {
  assert.deepEqual(fileArguments("yanxu.runFile", "/tmp/示例.yx"), ["/tmp/示例.yx"]);
  assert.deepEqual(fileArguments("yanxu.checkFile", "/tmp/示例.yx"), ["查", "/tmp/示例.yx"]);
  assert.deepEqual(fileArguments("yanxu.runVm", "/tmp/示例.yx"), ["字节", "/tmp/示例.yx"]);
  assert.deepEqual(fileArguments("yanxu.debugFile", "/tmp/示例.yx"), ["调", "/tmp/示例.yx"]);
  assert.deepEqual(fileArguments("yanxu.migrateFile", "/tmp/示例.yx"), ["迁", "--写", "/tmp/示例.yx"]);
});

test("工作区测试命令保留目标目录", () => {
  assert.deepEqual(taskArguments("test", "/workspace/言序"), ["试", "/workspace/言序"]);
  assert.deepEqual(taskArguments("compile", "/workspace/言序"), ["compile", "/workspace/言序"]);
  assert.deepEqual(taskArguments("bundle", "/workspace/言窗"), [
    "compile", "/workspace/言窗", "--release", "--bundle"
  ]);
});

test("程序参数只附加到会执行文卷的命令", () => {
  assert.deepEqual(fileArguments("yanxu.runFile", "/tmp/示例.yx", { programArgs: ["甲", "乙"] }), [
    "/tmp/示例.yx", "--", "甲", "乙"
  ]);
  assert.deepEqual(fileArguments("yanxu.checkFile", "/tmp/示例.yx", { programArgs: ["甲"] }), ["查", "/tmp/示例.yx"]);
  assert.deepEqual(taskArguments("package", "/work", { programArgs: ["甲"] }), ["包", "运行", "/work", "--", "甲"]);
});

test("规格测试可以附带筛选、并发和 JSON", () => {
  assert.deepEqual(taskArguments("test", "/work/spec", {
    test: { filter: "通过", jobs: 2, timeout: 1500, json: true }
  }), ["试", "/work/spec", "--筛", "通过", "--并发", "2", "--超时", "1500", "--json"]);
});

test("所有文件命令都引用已声明任务", () => {
  for (const spec of Object.values(FILE_COMMANDS)) assert.ok(TASK_COMMANDS[spec.task]);
});

test("未知命令会立即失败", () => {
  assert.throws(() => taskArguments("missing", "/tmp"), /未知言序任务/);
  assert.throws(() => fileArguments("yanxu.missing", "/tmp/a.yx"), /未知言序命令/);
});
