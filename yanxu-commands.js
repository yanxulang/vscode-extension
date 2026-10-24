const FILE_COMMANDS = Object.freeze({
  "yanxu.runFile": { task: "run", label: "运行当前文卷" },
  "yanxu.checkFile": { task: "check", label: "检查当前文卷" },
  "yanxu.runVm": { task: "vm", label: "使用 VM 运行当前文卷" },
  "yanxu.debugFile": { task: "trace", label: "跟踪当前文卷" },
  "yanxu.migrateFile": { task: "migrate", label: "迁移当前文卷" },
  "yanxu.documentFile": { task: "doc", label: "生成当前文卷 API 文档" }
});

const TASK_COMMANDS = Object.freeze({
  run: { label: "运行文卷", prefix: [], acceptsProgramArgs: true },
  check: { label: "检查文卷", prefix: ["查"] },
  vm: { label: "使用 VM 运行文卷", prefix: ["字节"], acceptsProgramArgs: true },
  trace: { label: "跟踪文卷", prefix: ["调"] },
  test: { label: "运行工作区测试", prefix: ["试"], workspace: true },
  compile: { label: "编译工作区 YXB 应用", prefix: ["compile"], workspace: true },
  bundle: {
    label: "构建发布版桌面应用 Bundle",
    prefix: ["compile"],
    suffix: ["--release", "--bundle"],
    workspace: true
  },
  migrate: { label: "迁移文卷", prefix: ["迁", "--写"] },
  doc: { label: "生成 API 文档", prefix: ["文"] },
  package: { label: "按清单运行包", prefix: ["包", "运行"], workspace: true, acceptsProgramArgs: true },
  lock: { label: "生成或验证包锁", prefix: ["包", "锁"], workspace: true },
  info: { label: "显示包清单", prefix: ["包"], workspace: true },
  compat: { label: "对照解释器与 VM", prefix: ["兼容"], workspace: true }
});

const TRUSTED_TASKS = new Set([
  "run", "vm", "trace", "test", "compile", "bundle", "migrate", "doc", "package", "lock", "compat"
]);

function taskArguments(command, target, options = {}) {
  const spec = TASK_COMMANDS[command];
  if (!spec) throw new Error(`未知言序任务：${command}`);
  const args = [...spec.prefix, target, ...(spec.suffix ?? [])];
  if (spec.acceptsProgramArgs && Array.isArray(options.programArgs) && options.programArgs.length) {
    args.push("--", ...options.programArgs);
  }
  if (command === "test" && options.test) {
    const { filter, jobs, timeout, json } = options.test;
    if (filter) args.push("--筛", String(filter));
    if (jobs) args.push("--并发", String(jobs));
    if (timeout) args.push("--超时", String(timeout));
    if (json) args.push("--json");
  }
  return args;
}

function fileArguments(commandId, file, options = {}) {
  const spec = FILE_COMMANDS[commandId];
  if (!spec) throw new Error(`未知言序命令：${commandId}`);
  return taskArguments(spec.task, file, options);
}

module.exports = {
  FILE_COMMANDS,
  TASK_COMMANDS,
  TRUSTED_TASKS,
  fileArguments,
  taskArguments
};
