const path = require("node:path");
const vscode = require("vscode");
const { TRUSTED_TASKS } = require("./yanxu-commands");
const { findManifestDirectory } = require("./project");

function configuration() {
  return vscode.workspace.getConfiguration("yanxu");
}

function executablePath() {
  const configured = configuration().get("executablePath", "yanxu");
  return typeof configured === "string" && configured.trim() ? configured.trim() : "yanxu";
}

function programArgs() {
  const args = configuration().get("run.programArgs", []);
  return Array.isArray(args) ? args.map((item) => String(item)).filter((item) => item.length > 0) : [];
}

function testingOptions() {
  const timeout = configuration().get("testing.timeout", 10000);
  const jobs = configuration().get("testing.jobs", 0);
  const pattern = configuration().get("testing.specPattern", "**/spec/**/*.yx");
  return {
    timeout: Number.isInteger(timeout) && timeout > 0 ? timeout : 10000,
    jobs: Number.isInteger(jobs) && jobs > 0 ? jobs : 0,
    pattern: typeof pattern === "string" && pattern.trim() ? pattern.trim() : "**/spec/**/*.yx"
  };
}

function codeLensEnabled() {
  return configuration().get("codeLens.enabled", true) !== false;
}

function pinyinEnabled() {
  return configuration().get("completion.pinyin", true) !== false;
}

function activeEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "yanxu") {
    vscode.window.showWarningMessage("请先打开一个言序文卷（.yx）。");
    return undefined;
  }
  return editor;
}

async function activeFile() {
  const editor = activeEditor();
  if (!editor) return undefined;
  if (editor.document.isUntitled) {
    vscode.window.showWarningMessage("请先保存当前言序文卷。");
    return undefined;
  }
  if (configuration().get("saveBeforeRun", true)) {
    const saved = await editor.document.save();
    if (!saved) {
      vscode.window.showErrorMessage("文卷未能保存，已取消命令。");
      return undefined;
    }
  }
  return editor.document.fileName;
}

function workspaceRoot(uri) {
  if (uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function projectStart() {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (uri?.scheme === "file") {
    const folder = workspaceRoot(uri);
    return findManifestDirectory(path.dirname(uri.fsPath), undefined, folder)
      || folder
      || path.dirname(uri.fsPath);
  }
  return workspaceRoot();
}

async function ensureTrusted(message = "运行言序代码前需要信任此工作区。") {
  if (vscode.workspace.isTrusted) return true;
  if (typeof vscode.workspace.requestWorkspaceTrust !== "function") return false;
  return (await vscode.workspace.requestWorkspaceTrust({ message })) === true;
}

async function ensureTaskTrusted(command) {
  if (!TRUSTED_TASKS.has(command)) return true;
  return ensureTrusted();
}

function createTask(definition, label, args, cwd) {
  const execution = new vscode.ShellExecution(executablePath(), args, cwd ? { cwd } : undefined);
  const scope = cwd && !String(cwd).includes("${")
    ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(cwd)) ?? vscode.TaskScope.Workspace
    : vscode.TaskScope.Workspace;
  const task = new vscode.Task(definition, scope, label, "yanxu", execution);
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: false
  };
  task.problemMatchers = ["$yanxu", "$yanxu-deprecation"];
  if (definition.command === "test") task.group = vscode.TaskGroup.Test;
  if (definition.command === "compile" || definition.command === "bundle") task.group = vscode.TaskGroup.Build;
  return task;
}

module.exports = {
  activeEditor,
  activeFile,
  codeLensEnabled,
  configuration,
  createTask,
  ensureTaskTrusted,
  ensureTrusted,
  executablePath,
  pinyinEnabled,
  programArgs,
  projectStart,
  testingOptions,
  workspaceRoot
};
