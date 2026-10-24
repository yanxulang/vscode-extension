const path = require("node:path");
const vscode = require("vscode");
const { FILE_COMMANDS, TASK_COMMANDS, fileArguments, taskArguments } = require("./yanxu-commands");
const { compatibilityDirectory, hasManifest, projectRoot, testDirectory } = require("./project");
const { TEMPLATES } = require("./templates");
const {
  activeEditor,
  activeFile,
  createTask,
  ensureTaskTrusted,
  ensureTrusted,
  executablePath,
  programArgs,
  projectStart,
  workspaceRoot
} = require("./runtime");

const PACKAGE_COMMANDS = new Set(["package", "lock", "info", "compile", "bundle"]);

let replTerminal;

function argumentsFor(command, target) {
  const options = TASK_COMMANDS[command]?.acceptsProgramArgs ? { programArgs: programArgs() } : {};
  return taskArguments(command, target, options);
}

async function executeFileCommand(commandId) {
  const spec = FILE_COMMANDS[commandId];
  if (!spec || !(await ensureTaskTrusted(spec.task))) return;
  const file = await activeFile();
  if (!file) return;
  const options = TASK_COMMANDS[spec.task]?.acceptsProgramArgs ? { programArgs: programArgs() } : {};
  await vscode.tasks.executeTask(createTask(
    { type: "yanxu", command: spec.task },
    `言序：${spec.label}`,
    fileArguments(commandId, file, options),
    path.dirname(file)
  ));
}

async function executeProjectCommand(command, label) {
  if (!(await ensureTaskTrusted(command))) return;
  const root = projectStart();
  if (!root) {
    vscode.window.showWarningMessage("请先打开一个言序文件夹。");
    return;
  }
  if (PACKAGE_COMMANDS.has(command) && !hasManifest(root)) {
    vscode.window.showWarningMessage("当前文件夹没有言序.toml，不能按包工程执行。");
    return;
  }
  const target = command === "test"
    ? testDirectory(root)
    : command === "compat"
      ? compatibilityDirectory(root)
      : root;
  if (command === "test" && target === root) {
    const choice = await vscode.window.showWarningMessage(
      "没有找到 spec 目录，将把项目中的全部 .yx 文卷当作规格运行。",
      { modal: true },
      "继续"
    );
    if (choice !== "继续") return;
  }
  await vscode.tasks.executeTask(createTask(
    { type: "yanxu", command, target },
    `言序：${label}`,
    argumentsFor(command, target),
    command === "compat" ? path.dirname(target) : root
  ));
}

function openRepl() {
  if (!replTerminal) {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const cwd = uri?.scheme === "file" ? workspaceRoot(uri) || path.dirname(uri.fsPath) : workspaceRoot();
    replTerminal = vscode.window.createTerminal({
      name: "言序 REPL",
      shellPath: executablePath(),
      cwd
    });
  }
  replTerminal.show();
  return replTerminal;
}

async function runSelection() {
  if (!(await ensureTrusted())) return;
  const editor = activeEditor();
  if (!editor) return;
  const selection = editor.selection.isEmpty
    ? editor.document.lineAt(editor.selection.active.line).text
    : editor.document.getText(editor.selection);
  if (!selection.trim()) {
    vscode.window.showInformationMessage("当前选区或行没有可运行的内容。");
    return;
  }
  openRepl().sendText(selection, true);
}

async function newFile() {
  const picked = await vscode.window.showQuickPick(TEMPLATES.map((template) => ({
    label: template.label,
    description: template.filename,
    detail: template.description,
    template
  })), { title: "新建言序文卷", placeHolder: "选择文卷模板" });
  if (!picked) return;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const target = await vscode.window.showSaveDialog({
    defaultUri: folder
      ? vscode.Uri.joinPath(folder, picked.template.filename)
      : vscode.Uri.file(picked.template.filename),
    filters: { 言序: ["yx"] },
    saveLabel: "创建"
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(target, Buffer.from(picked.template.body, "utf8"));
  const document = await vscode.workspace.openTextDocument(target);
  await vscode.languages.setTextDocumentLanguage(document, "yanxu");
  await vscode.window.showTextDocument(document);
}

function registerRunner(context) {
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === replTerminal) replTerminal = undefined;
    }),
    vscode.tasks.registerTaskProvider("yanxu", {
      provideTasks() {
        const folders = vscode.workspace.workspaceFolders ?? [];
        const tasks = [];
        for (const [command, spec] of Object.entries(TASK_COMMANDS)) {
          if (!spec.workspace) {
            tasks.push(createTask(
              { type: "yanxu", command },
              `言序：${spec.label}`,
              argumentsFor(command, "${file}"),
              "${workspaceFolder}"
            ));
            continue;
          }
          if (!folders.length) {
            tasks.push(createTask(
              { type: "yanxu", command },
              `言序：${spec.label}`,
              argumentsFor(command, "${workspaceFolder}"),
              "${workspaceFolder}"
            ));
            continue;
          }
          for (const folder of folders) {
            const root = projectRoot(folder.uri.fsPath, undefined, folder.uri.fsPath);
            if (PACKAGE_COMMANDS.has(command) && !hasManifest(root)) continue;
            const target = command === "test"
              ? testDirectory(root)
              : command === "compat"
                ? compatibilityDirectory(root)
                : root;
            const label = folders.length > 1 ? `言序：${spec.label}（${folder.name}）` : `言序：${spec.label}`;
            tasks.push(createTask(
              { type: "yanxu", command, target },
              label,
              argumentsFor(command, target),
              command === "compat" ? path.dirname(target) : root
            ));
          }
        }
        return tasks;
      },
      resolveTask(task) {
        const command = task.definition.command;
        const spec = TASK_COMMANDS[command];
        if (!spec) return undefined;
        const target = task.definition.target
          ?? (spec.workspace ? "${workspaceFolder}" : "${file}");
        return createTask(
          task.definition,
          task.name || `言序：${spec.label}`,
          argumentsFor(command, target),
          "${workspaceFolder}"
        );
      }
    }),
    vscode.window.registerTerminalProfileProvider("yanxu.repl", {
      provideTerminalProfile() {
        const uri = vscode.window.activeTextEditor?.document.uri;
        const cwd = uri?.scheme === "file" ? workspaceRoot(uri) || path.dirname(uri.fsPath) : workspaceRoot();
        return new vscode.TerminalProfile({
          name: "言序 REPL",
          shellPath: executablePath(),
          cwd
        });
      }
    }),
    vscode.commands.registerCommand("yanxu.runFile", () => executeFileCommand("yanxu.runFile")),
    vscode.commands.registerCommand("yanxu.checkFile", () => executeFileCommand("yanxu.checkFile")),
    vscode.commands.registerCommand("yanxu.runVm", () => executeFileCommand("yanxu.runVm")),
    vscode.commands.registerCommand("yanxu.debugFile", () => executeFileCommand("yanxu.debugFile")),
    vscode.commands.registerCommand("yanxu.migrateFile", () => executeFileCommand("yanxu.migrateFile")),
    vscode.commands.registerCommand("yanxu.documentFile", () => executeFileCommand("yanxu.documentFile")),
    vscode.commands.registerCommand("yanxu.runSelection", runSelection),
    vscode.commands.registerCommand("yanxu.formatFile", () => vscode.commands.executeCommand("editor.action.formatDocument")),
    vscode.commands.registerCommand("yanxu.testWorkspace", () => executeProjectCommand("test", "运行工作区测试")),
    vscode.commands.registerCommand("yanxu.compileWorkspace", () => executeProjectCommand("compile", "编译工作区 YXB 应用")),
    vscode.commands.registerCommand("yanxu.compileBundle", () => executeProjectCommand("bundle", "构建发布版桌面应用 Bundle")),
    vscode.commands.registerCommand("yanxu.runPackage", () => executeProjectCommand("package", "按清单运行包")),
    vscode.commands.registerCommand("yanxu.showPackage", () => executeProjectCommand("info", "显示包清单")),
    vscode.commands.registerCommand("yanxu.lockPackage", () => executeProjectCommand("lock", "生成或验证包锁")),
    vscode.commands.registerCommand("yanxu.checkCompatibility", () => executeProjectCommand("compat", "对照解释器与 VM")),
    vscode.commands.registerCommand("yanxu.openRepl", async () => {
      if (await ensureTrusted("打开可以执行代码的 REPL 前需要信任此工作区。")) openRepl();
    }),
    vscode.commands.registerCommand("yanxu.newFile", newFile)
  );
}

module.exports = { registerRunner };
