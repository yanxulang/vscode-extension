const path = require("node:path");
const vscode = require("vscode");
const { taskArguments } = require("./yanxu-commands");
const { runProcess } = require("./process-run");
const { activeFile, ensureTrusted, executablePath, testingOptions } = require("./runtime");
const { clip, matchingCase, parseTestReport } = require("./test-report");

function registerTesting(context) {
  const controller = vscode.tests.createTestController("yanxu", "言序规格");
  const discovered = new Map();
  let refreshTimer;

  function leaves(item, into) {
    if (item.children.size > 0) item.children.forEach((child) => leaves(child, into));
    else into.push(item);
  }

  function requestedItems(request) {
    const included = [];
    if (!request.include) controller.items.forEach((item) => leaves(item, included));
    else request.include.forEach((item) => leaves(item, included));
    const excluded = [];
    request.exclude?.forEach((item) => leaves(item, excluded));
    const excludedIds = new Set(excluded.map((item) => item.id));
    const seen = new Set();
    return included.filter((item) => {
      if (!item.uri || excludedIds.has(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function findItem(uri) {
    const id = uri.toString();
    let found;
    const walk = (collection) => {
      collection.forEach((item) => {
        if (found) return;
        if (item.id === id) found = item;
        else walk(item.children);
      });
    };
    walk(controller.items);
    return found;
  }

  async function discover() {
    const { pattern } = testingOptions();
    let files = [];
    try {
      files = await vscode.workspace.findFiles(pattern, "**/{.git,node_modules,target,dist,out,build}/**", 2000);
    } catch (error) {
      vscode.window.showWarningMessage(`无法扫描言序规格：${error.message}`);
      return;
    }
    controller.items.replace([]);
    discovered.clear();
    const roots = new Map();
    for (const file of files) {
      const directory = path.dirname(file.fsPath);
      let root = roots.get(directory);
      if (!root) {
        const folder = vscode.workspace.getWorkspaceFolder(file);
        const label = folder ? path.relative(folder.uri.fsPath, directory) || path.basename(directory) : directory;
        root = controller.createTestItem(directory, label, vscode.Uri.file(directory));
        root.canResolveChildren = false;
        controller.items.add(root);
        roots.set(directory, root);
        discovered.set(directory, []);
      }
      const item = controller.createTestItem(file.toString(), path.relative(directory, file.fsPath), file);
      item.range = new vscode.Range(0, 0, 0, 1);
      root.children.add(item);
      discovered.get(directory).push(item);
    }
  }

  function scheduleDiscover() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      discover().catch(() => {});
    }, 200);
  }

  function applyResult(run, item, report, result) {
    if (result.error === "ENOENT") {
      run.errored(item, new vscode.TestMessage("找不到言序程序。请运行“言序：选择言序程序”。"));
      return;
    }
    const entry = report && matchingCase(report, item.uri.fsPath);
    if (!entry) {
      run.errored(item, new vscode.TestMessage(clip(result.stderr || result.stdout || "测试没有返回可解析的 JSON 报告")));
      return;
    }
    const duration = Number(entry.duration_ms);
    const elapsed = Number.isFinite(duration) ? duration : undefined;
    if (entry.passed) run.passed(item, elapsed);
    else run.failed(item, new vscode.TestMessage(clip(entry.detail)), elapsed);
  }

  async function runGroup(directory, items, wholeDirectory, run, token) {
    const options = testingOptions();
    const plans = wholeDirectory
      ? [{ target: directory, items }]
      : items.map((item) => ({ target: item.uri.fsPath, items: [item] }));
    for (const plan of plans) {
      if (token.isCancellationRequested) {
        for (const item of plan.items) run.skipped(item);
        continue;
      }
      for (const item of plan.items) run.started(item);
      const args = taskArguments("test", plan.target, {
        test: {
          json: true,
          timeout: options.timeout,
          jobs: options.jobs || undefined
        }
      });
      const result = await runProcess(executablePath(), args, {
        cwd: path.dirname(plan.target),
        token,
        timeout: Math.min(options.timeout * Math.max(plan.items.length, 1) + 15000, 30 * 60 * 1000)
      });
      if (result.stdout) run.appendOutput(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
      if (result.stderr) run.appendOutput(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
      const report = parseTestReport(result.stdout);
      for (const item of plan.items) applyResult(run, item, report, result);
    }
  }

  async function runTests(request, token) {
    const run = controller.createTestRun(request);
    if (!(await ensureTrusted("运行言序规格前需要信任此工作区。"))) {
      run.end();
      return;
    }
    const items = requestedItems(request);
    const byDirectory = new Map();
    for (const item of items) {
      const directory = path.dirname(item.uri.fsPath);
      if (!byDirectory.has(directory)) byDirectory.set(directory, []);
      byDirectory.get(directory).push(item);
    }
    try {
      for (const [directory, group] of byDirectory) {
        const known = discovered.get(directory) ?? [];
        const wholeDirectory = known.length > 0 && known.length === group.length && known.every((item) => group.includes(item));
        await runGroup(directory, group, wholeDirectory, run, token);
      }
    } finally {
      run.end();
    }
  }

  controller.refreshHandler = discover;
  controller.resolveHandler = discover;
  controller.createRunProfile("运行", vscode.TestRunProfileKind.Run, runTests, true);
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.yx");
  context.subscriptions.push(
    controller,
    watcher,
    watcher.onDidCreate(scheduleDiscover),
    watcher.onDidDelete(scheduleDiscover),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("yanxu.testing")) scheduleDiscover();
    }),
    vscode.commands.registerCommand("yanxu.refreshTests", () => discover()),
    vscode.commands.registerCommand("yanxu.runCurrentTest", async () => {
      const file = await activeFile();
      if (!file) return;
      const uri = vscode.Uri.file(file);
      const item = findItem(uri) ?? controller.createTestItem(uri.toString(), path.basename(file), uri);
      if (!findItem(uri)) {
        item.range = new vscode.Range(0, 0, 0, 1);
        controller.items.add(item);
      }
      const source = new vscode.CancellationTokenSource();
      try {
        await runTests(new vscode.TestRunRequest([item]), source.token);
      } finally {
        source.dispose();
      }
    })
  );
  discover().catch(() => {});
}

module.exports = { registerTesting };
