const FILE_COMMANDS = Object.freeze({
  "yanxu.runFile": { task: "run", label: "运行当前文卷" },
  "yanxu.checkFile": { task: "check", label: "检查当前文卷" },
  "yanxu.runVm": { task: "vm", label: "使用 VM 运行当前文卷" },
  "yanxu.debugFile": { task: "trace", label: "跟踪当前文卷" }
});

const TASK_COMMANDS = Object.freeze({
  run: { label: "运行文卷", prefix: [] },
  check: { label: "检查文卷", prefix: ["查"] },
  vm: { label: "使用 VM 运行文卷", prefix: ["字节"] },
  trace: { label: "跟踪文卷", prefix: ["调"] },
  test: { label: "运行工作区测试", prefix: ["试"] }
});

function taskArguments(command, target) {
  const spec = TASK_COMMANDS[command];
  if (!spec) throw new Error(`未知言序任务：${command}`);
  return [...spec.prefix, target];
}

function fileArguments(commandId, file) {
  const spec = FILE_COMMANDS[commandId];
  if (!spec) throw new Error(`未知言序命令：${commandId}`);
  return taskArguments(spec.task, file);
}

module.exports = { FILE_COMMANDS, TASK_COMMANDS, fileArguments, taskArguments };
