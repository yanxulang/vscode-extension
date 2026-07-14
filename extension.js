const path = require("node:path");
const vscode = require("vscode");
const { LanguageClient, State } = require("vscode-languageclient/node");
const {
  FILE_COMMANDS,
  TASK_COMMANDS,
  fileArguments,
  taskArguments
} = require("./yanxu-commands");
const {
  completionEntries,
  lookupLanguageSymbol,
  signatureAt
} = require("./language-features");

let client;
let clientWatcher;
let clientStateSubscription;
let languageOutput;
let languageStatus;
let replTerminal;

function configuration() {
  return vscode.workspace.getConfiguration("yanxu");
}

function executablePath() {
  return configuration().get("executablePath", "yanxu");
}

function languageServerEnabled() {
  return configuration().get("languageServer.enabled", true);
}

function activeYanxuEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "yanxu") {
    vscode.window.showWarningMessage("请先打开一个言序文卷（.yx）。");
    return undefined;
  }
  return editor;
}

async function activeYanxuFile() {
  const editor = activeYanxuEditor();
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

function workingDirectory(uri) {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? path.dirname(uri.fsPath);
}

function createTask(definition, label, args, cwd) {
  const execution = new vscode.ShellExecution(executablePath(), args, cwd ? { cwd } : undefined);
  const scope = cwd && !cwd.includes("${")
    ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(cwd)) ?? vscode.TaskScope.Workspace
    : vscode.TaskScope.Workspace;
  const task = new vscode.Task(definition, scope, label, "yanxu", execution);
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: false
  };
  return task;
}

async function executeFileCommand(commandId) {
  const file = await activeYanxuFile();
  if (!file) return;
  const spec = FILE_COMMANDS[commandId];
  await vscode.tasks.executeTask(
    createTask({ type: "yanxu", command: spec.task }, `言序：${spec.label}`, fileArguments(commandId, file), path.dirname(file))
  );
}

function openRepl() {
  if (!replTerminal) {
    const uri = vscode.window.activeTextEditor?.document.uri;
    replTerminal = vscode.window.createTerminal({
      name: "言序 REPL",
      shellPath: executablePath(),
      cwd: uri ? workingDirectory(uri) : undefined
    });
  }
  replTerminal.show();
  return replTerminal;
}

function runSelection() {
  const editor = activeYanxuEditor();
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

async function testWorkspace() {
  const uri = vscode.window.activeTextEditor?.document.uri;
  const root = (uri && vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath)
    ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage("请先打开包含言序文卷的文件夹。");
    return;
  }
  await vscode.tasks.executeTask(
    createTask({ type: "yanxu", command: "test" }, "言序：运行工作区测试", taskArguments("test", root), root)
  );
}

function updateLanguageStatus(state, detail) {
  if (!languageStatus) return;
  const states = {
    starting: ["$(sync~spin) 言序", "言序语言服务正在启动", "请稍候"],
    running: ["$(check) 言序", "言序语言服务已连接", "点击可重启"],
    stopped: ["$(debug-disconnect) 言序", "言序语言服务未连接", "点击可重启"],
    disabled: ["$(circle-slash) 言序", "言序语言服务已停用", "点击可启用"],
    failed: ["$(error) 言序", "言序语言服务启动失败", "点击可重试"]
  };
  const [text, tooltip, action] = states[state] ?? states.stopped;
  languageStatus.text = text;
  languageStatus.tooltip = detail ? `${tooltip}\n${detail}\n${action}` : `${tooltip}\n${action}`;
}

function syncLanguageStatusVisibility() {
  if (vscode.window.activeTextEditor?.document.languageId === "yanxu") languageStatus.show();
  else languageStatus.hide();
}

async function stopLanguageServer() {
  clientStateSubscription?.dispose();
  clientStateSubscription = undefined;
  clientWatcher?.dispose();
  clientWatcher = undefined;
  if (client) {
    const current = client;
    client = undefined;
    await current.stop().catch((error) => languageOutput.appendLine(`停止语言服务失败：${error.message}`));
  }
}

async function startLanguageServer({ notify = true } = {}) {
  await stopLanguageServer();
  if (!languageServerEnabled()) {
    updateLanguageStatus("disabled");
    return;
  }

  updateLanguageStatus("starting");
  clientWatcher = vscode.workspace.createFileSystemWatcher("**/*.yx");
  const nextClient = new LanguageClient(
    "yanxuLanguageServer",
    "言序语言服务",
    { command: executablePath(), args: ["语言服务"] },
    {
      documentSelector: [
        { scheme: "file", language: "yanxu" },
        { scheme: "untitled", language: "yanxu" }
      ],
      synchronize: { fileEvents: clientWatcher },
      outputChannel: languageOutput
    }
  );
  client = nextClient;
  clientStateSubscription = nextClient.onDidChangeState(({ newState }) => {
    if (newState === State.Running) updateLanguageStatus("running");
    else if (newState === State.Stopped) updateLanguageStatus("stopped");
    else updateLanguageStatus("starting");
  });

  try {
    await nextClient.start();
  } catch (error) {
    if (client === nextClient) client = undefined;
    clientStateSubscription?.dispose();
    clientStateSubscription = undefined;
    clientWatcher?.dispose();
    clientWatcher = undefined;
    languageOutput.appendLine(`启动语言服务失败：${error.stack ?? error.message}`);
    updateLanguageStatus("failed", error.message);
    if (!notify) return;
    const choice = await vscode.window.showErrorMessage(
      `无法启动言序语言服务：${error.message}`,
      "配置路径",
      "查看日志",
      "停用语言服务"
    );
    if (choice === "配置路径") {
      vscode.commands.executeCommand("workbench.action.openSettings", "yanxu.executablePath");
    } else if (choice === "查看日志") {
      languageOutput.show();
    } else if (choice === "停用语言服务") {
      configuration().update("languageServer.enabled", false, vscode.ConfigurationTarget.Global);
    }
  }
}

async function restartLanguageServer() {
  if (!languageServerEnabled()) {
    await configuration().update("languageServer.enabled", true, vscode.ConfigurationTarget.Global);
    return;
  }
  await startLanguageServer();
  if (client) vscode.window.showInformationMessage("言序语言服务已重启。");
}

function createTaskProvider() {
  return {
    provideTasks() {
      const file = "${file}";
      const root = "${workspaceFolder}";
      return Object.entries(TASK_COMMANDS).map(([command, spec]) => {
        const target = command === "test" ? root : file;
        return createTask(
          { type: "yanxu", command },
          `言序：${spec.label}`,
          taskArguments(command, target),
          root
        );
      });
    },
    resolveTask(task) {
      const command = task.definition.command;
      const spec = TASK_COMMANDS[command];
      if (!spec) return undefined;
      const target = task.definition.target ?? (command === "test" ? "${workspaceFolder}" : "${file}");
      return createTask(task.definition, task.name || `言序：${spec.label}`, taskArguments(command, target), "${workspaceFolder}");
    }
  };
}

function createDebugConfigurationProvider() {
  return {
    provideDebugConfigurations() {
      return [{
        type: "yanxu",
        request: "launch",
        name: "调试当前言序文卷",
        program: "${file}",
        stopOnEntry: false
      }];
    },
    resolveDebugConfiguration(_folder, config) {
      if (!config.type && !config.request && !config.name) {
        config.type = "yanxu";
        config.request = "launch";
        config.name = "调试当前言序文卷";
        config.program = "${file}";
      }
      if (!config.program) {
        const editor = activeYanxuEditor();
        if (!editor || editor.document.isUntitled) return undefined;
        config.program = editor.document.fileName;
      }
      return config;
    }
  };
}

function createDebugAdapterFactory() {
  return {
    createDebugAdapterDescriptor() {
      return new vscode.DebugAdapterExecutable(executablePath(), ["调试服务"]);
    }
  };
}

function completionKind(kind) {
  return {
    keyword: vscode.CompletionItemKind.Keyword,
    type: vscode.CompletionItemKind.Class,
    function: vscode.CompletionItemKind.Function,
    constant: vscode.CompletionItemKind.Constant,
    module: vscode.CompletionItemKind.Module
  }[kind] ?? vscode.CompletionItemKind.Text;
}

function languageDocumentation(entry) {
  const markdown = new vscode.MarkdownString();
  if (entry.signature) markdown.appendCodeblock(entry.signature, "yanxu");
  else markdown.appendMarkdown(`**${entry.label}** — ${entry.detail}\n\n`);
  markdown.appendMarkdown(entry.documentation);
  return markdown;
}

function createCompletionProvider() {
  return {
    provideCompletionItems(document, position) {
      if (client?.state === State.Running) return undefined;
      const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
      return completionEntries(linePrefix).map((entry) => {
        const item = new vscode.CompletionItem(entry.label, completionKind(entry.kind));
        item.detail = entry.detail;
        item.documentation = languageDocumentation(entry);
        item.sortText = `${entry.kind === "function" ? "1" : "2"}-${entry.label}`;
        if (entry.insertText) item.insertText = new vscode.SnippetString(entry.insertText);
        return item;
      });
    }
  };
}

function createHoverProvider() {
  return {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(
        position,
        /[^\s（）()【】\[\]{}，,:：.；;"“”「」]+/
      );
      if (!range) return undefined;
      const entry = lookupLanguageSymbol(document.getText(range));
      return entry ? new vscode.Hover(languageDocumentation(entry), range) : undefined;
    }
  };
}

function createSignatureHelpProvider() {
  return {
    provideSignatureHelp(document, position) {
      const start = new vscode.Position(Math.max(0, position.line - 20), 0);
      const entry = signatureAt(document.getText(new vscode.Range(start, position)));
      if (!entry) return undefined;

      const signature = new vscode.SignatureInformation(entry.signature, entry.documentation);
      signature.parameters = entry.parameters.map((parameter) => new vscode.ParameterInformation(parameter));
      const help = new vscode.SignatureHelp();
      help.signatures = [signature];
      help.activeSignature = 0;
      help.activeParameter = entry.activeParameter;
      return help;
    }
  };
}

async function activate(context) {
  languageOutput = vscode.window.createOutputChannel("言序语言服务");
  languageStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  languageStatus.command = "yanxu.restartLanguageServer";

  context.subscriptions.push(
    languageOutput,
    languageStatus,
    vscode.window.onDidChangeActiveTextEditor(syncLanguageStatusVisibility),
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === replTerminal) replTerminal = undefined;
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("yanxu.executablePath") || event.affectsConfiguration("yanxu.languageServer.enabled")) {
        startLanguageServer();
      }
    }),
    vscode.tasks.registerTaskProvider("yanxu", createTaskProvider()),
    vscode.debug.registerDebugConfigurationProvider("yanxu", createDebugConfigurationProvider()),
    vscode.debug.registerDebugAdapterDescriptorFactory("yanxu", createDebugAdapterFactory()),
    vscode.languages.registerCompletionItemProvider("yanxu", createCompletionProvider(), "：", ":", "|"),
    vscode.languages.registerHoverProvider("yanxu", createHoverProvider()),
    vscode.languages.registerSignatureHelpProvider(
      "yanxu",
      createSignatureHelpProvider(),
      "（",
      "(",
      "，",
      ","
    ),
    vscode.commands.registerCommand("yanxu.runFile", () => executeFileCommand("yanxu.runFile")),
    vscode.commands.registerCommand("yanxu.checkFile", () => executeFileCommand("yanxu.checkFile")),
    vscode.commands.registerCommand("yanxu.runVm", () => executeFileCommand("yanxu.runVm")),
    vscode.commands.registerCommand("yanxu.debugFile", () => executeFileCommand("yanxu.debugFile")),
    vscode.commands.registerCommand("yanxu.migrateFile", () => executeFileCommand("yanxu.migrateFile")),
    vscode.commands.registerCommand("yanxu.runSelection", runSelection),
    vscode.commands.registerCommand("yanxu.formatFile", () => vscode.commands.executeCommand("editor.action.formatDocument")),
    vscode.commands.registerCommand("yanxu.testWorkspace", testWorkspace),
    vscode.commands.registerCommand("yanxu.openRepl", openRepl),
    vscode.commands.registerCommand("yanxu.restartLanguageServer", restartLanguageServer),
    vscode.commands.registerCommand("yanxu.showLanguageServerOutput", () => languageOutput.show()),
    vscode.commands.registerCommand("yanxu.openDocs", () => vscode.env.openExternal(vscode.Uri.parse("https://docs.yanxu.dev/")))
  );

  syncLanguageStatusVisibility();
  await startLanguageServer({ notify: false });
}

async function deactivate() {
  await stopLanguageServer();
}

module.exports = { activate, deactivate };
