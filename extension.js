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
const { callAt, romanize } = require("./symbol-index");
const { WorkspaceIndexer } = require("./workspace-indexer");

let client;
let clientWatcher;
let clientStateSubscription;
let languageOutput;
let languageStatus;
let replTerminal;
let workspaceIndexer;

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
      outputChannel: languageOutput,
      middleware: {
        async provideCompletionItem(document, position, context, token, next) {
          const result = await next(document, position, context, token);
          const items = Array.isArray(result) ? result : result?.items;
          const indexedNames = new Set(
            indexedCompletionSymbols(workspaceIndexer?.index, document, position).map(({ name }) => name)
          );
          for (const item of items ?? []) {
            const label = typeof item.label === "string" ? item.label : item.label?.label;
            if (!label) continue;
            if (configuration().get("completion.pinyin", true)) {
              const search = romanize(label).filterText;
              item.filterText = [...new Set([item.filterText, search].filter(Boolean))].join(" ");
            }
          }
          const filtered = (items ?? []).filter((item) => {
            const label = typeof item.label === "string" ? item.label : item.label?.label;
            return !indexedNames.has(label);
          });
          if (Array.isArray(result)) return filtered;
          if (result?.items) result.items = filtered;
          return result;
        }
      }
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
    class: vscode.CompletionItemKind.Class,
    interface: vscode.CompletionItemKind.Interface,
    function: vscode.CompletionItemKind.Function,
    method: vscode.CompletionItemKind.Method,
    field: vscode.CompletionItemKind.Field,
    variable: vscode.CompletionItemKind.Variable,
    parameter: vscode.CompletionItemKind.Variable,
    constant: vscode.CompletionItemKind.Constant,
    module: vscode.CompletionItemKind.Module
  }[kind] ?? vscode.CompletionItemKind.Text;
}

function symbolKind(kind) {
  return {
    module: vscode.SymbolKind.Module,
    class: vscode.SymbolKind.Class,
    interface: vscode.SymbolKind.Interface,
    function: vscode.SymbolKind.Function,
    method: vscode.SymbolKind.Method,
    field: vscode.SymbolKind.Field,
    variable: vscode.SymbolKind.Variable,
    parameter: vscode.SymbolKind.Variable,
    constant: vscode.SymbolKind.Constant
  }[kind] ?? vscode.SymbolKind.String;
}

function languageDocumentation(entry) {
  const markdown = new vscode.MarkdownString();
  if (entry.signature) markdown.appendCodeblock(entry.signature, "yanxu");
  else markdown.appendMarkdown(`**${entry.label}** — ${entry.detail}\n\n`);
  markdown.appendMarkdown(entry.documentation);
  return markdown;
}

function indexedDocumentation(symbol) {
  const markdown = new vscode.MarkdownString();
  markdown.appendCodeblock(symbol.detail || symbol.name, "yanxu");
  if (symbol.documentation) markdown.appendMarkdown(`\n${symbol.documentation}`);
  if (symbol.container) markdown.appendMarkdown(`\n\n归属：**${symbol.container}**`);
  return markdown;
}

function indexedInsertText(symbol) {
  if (!["function", "method"].includes(symbol.kind)) return symbol.name;
  const parameters = symbol.parameters ?? [];
  if (!parameters.length) return `${symbol.name}（）`;
  const placeholders = parameters.map((parameter, index) => `\${${index + 1}:${parameter.name}}`);
  return `${symbol.name}（${placeholders.join("，")}）`;
}

function indexedCompletionSymbols(indexer, document, position) {
  if (!indexer) return [];
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  const memberMatch = linePrefix.match(/([^\s（）()【】\[\]{}，,:：.；;"“”「」]+)\s*\.\s*[^\s（）()【】\[\]{}，,:：.；;"“”「」]*$/);
  if (/标准\s*[:：][^」”"]*$/.test(linePrefix)) return indexer.standardModuleSymbols();
  if (memberMatch) return indexer.membersForQualifier(document.uri.toString(), memberMatch[1], position.line);
  return indexer.completionSymbols(document.uri.toString(), position.line, true);
}

function createCompletionProvider(indexer) {
  return {
    provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
      const serverRunning = client?.state === State.Running;
      const indexed = indexedCompletionSymbols(indexer, document, position);
      const base = serverRunning ? [] : completionEntries(linePrefix);
      const baseItems = base.map((entry) => {
        const item = new vscode.CompletionItem(entry.label, completionKind(entry.kind));
        item.detail = entry.detail;
        item.documentation = languageDocumentation(entry);
        item.sortText = `${entry.kind === "function" ? "1" : "2"}-${entry.label}`;
        item.filterText = configuration().get("completion.pinyin", true)
          ? romanize(entry.label).filterText
          : entry.label;
        if (entry.insertText) item.insertText = new vscode.SnippetString(entry.insertText);
        return item;
      });
      const indexedItems = indexed.map((symbol) => {
        const item = new vscode.CompletionItem(symbol.name, completionKind(symbol.kind));
        const origin = symbol.fsPath ? path.basename(symbol.fsPath) : "标准库";
        item.detail = `言序索引 · ${symbol.detail || symbol.kind} · ${origin}`;
        item.documentation = indexedDocumentation(symbol);
        item.sortText = `0-${symbol.name}`;
        item.filterText = configuration().get("completion.pinyin", true) ? symbol.filterText : symbol.name;
        const insertText = indexedInsertText(symbol);
        item.insertText = ["function", "method"].includes(symbol.kind)
          ? new vscode.SnippetString(insertText)
          : insertText;
        return item;
      });
      return [...indexedItems, ...baseItems];
    }
  };
}

function wordRange(document, position) {
  return document.getWordRangeAtPosition(
    position,
    /[^\s（）()【】\[\]{}，,:：.；;"“”「」]+/
  );
}

function qualifierBefore(document, range) {
  const prefix = document.lineAt(range.start.line).text.slice(0, range.start.character);
  return prefix.match(/([^\s（）()【】\[\]{}，,:：.；;"“”「」]+)\s*\.\s*$/)?.[1] ?? "";
}

function createHoverProvider(indexer) {
  return {
    provideHover(document, position) {
      const range = wordRange(document, position);
      if (!range) return undefined;
      const name = document.getText(range);
      const entry = lookupLanguageSymbol(name);
      if (entry) return new vscode.Hover(languageDocumentation(entry), range);
      const symbol = indexer.definitions(
        document.uri.toString(),
        name,
        qualifierBefore(document, range),
        position.line
      )[0];
      return symbol ? new vscode.Hover(indexedDocumentation(symbol), range) : undefined;
    }
  };
}

function createSignatureHelpProvider(indexer) {
  return {
    provideSignatureHelp(document, position) {
      const start = new vscode.Position(Math.max(0, position.line - 20), 0);
      const source = document.getText(new vscode.Range(start, position));
      const entry = signatureAt(source);
      if (entry) {
        const signature = new vscode.SignatureInformation(entry.signature, entry.documentation);
        signature.parameters = entry.parameters.map((parameter) => new vscode.ParameterInformation(parameter));
        const help = new vscode.SignatureHelp();
        help.signatures = [signature];
        help.activeSignature = 0;
        help.activeParameter = entry.activeParameter;
        return help;
      }

      const call = callAt(source);
      if (!call) return undefined;
      const symbol = indexer.signature(document.uri.toString(), call.name, call.qualifier, position.line);
      if (!symbol) return undefined;

      const signature = new vscode.SignatureInformation(symbol.detail || symbol.name, symbol.documentation);
      signature.parameters = (symbol.parameters ?? []).map(
        (parameter) => new vscode.ParameterInformation(parameter.type ? `${parameter.name}：${parameter.type}` : parameter.name)
      );
      const help = new vscode.SignatureHelp();
      help.signatures = [signature];
      help.activeSignature = 0;
      help.activeParameter = Math.min(call.activeParameter, Math.max(0, signature.parameters.length - 1));
      return help;
    }
  };
}

function symbolLocation(symbol) {
  const uri = vscode.Uri.parse(symbol.uri);
  const start = new vscode.Position(symbol.line, symbol.character);
  const end = new vscode.Position(symbol.line, symbol.endCharacter);
  return new vscode.Location(uri, new vscode.Range(start, end));
}

function createDefinitionProvider(indexer) {
  return {
    provideDefinition(document, position) {
      const range = wordRange(document, position);
      if (!range) return undefined;
      const targets = indexer.definitions(
        document.uri.toString(),
        document.getText(range),
        qualifierBefore(document, range),
        position.line
      );
      const useful = client?.state === State.Running
        ? targets.filter((symbol) => symbol.uri !== document.uri.toString())
        : targets;
      return useful.length ? useful.map(symbolLocation) : undefined;
    }
  };
}

function createWorkspaceSymbolProvider(indexer) {
  return {
    provideWorkspaceSymbols(query) {
      return indexer.workspaceSymbols(query).map((symbol) => new vscode.SymbolInformation(
        symbol.name,
        symbolKind(symbol.kind),
        symbol.container || "言序",
        symbolLocation(symbol)
      ));
    }
  };
}

async function activate(context) {
  languageOutput = vscode.window.createOutputChannel("言序语言服务");
  languageStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  languageStatus.command = "yanxu.restartLanguageServer";
  workspaceIndexer = new WorkspaceIndexer(languageOutput);

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
      if (event.affectsConfiguration("yanxu.index") || event.affectsConfiguration("yanxu.executablePath")) {
        workspaceIndexer.refreshConfiguration();
      }
    }),
    workspaceIndexer,
    vscode.tasks.registerTaskProvider("yanxu", createTaskProvider()),
    vscode.debug.registerDebugConfigurationProvider("yanxu", createDebugConfigurationProvider()),
    vscode.debug.registerDebugAdapterDescriptorFactory("yanxu", createDebugAdapterFactory()),
    vscode.languages.registerCompletionItemProvider("yanxu", createCompletionProvider(workspaceIndexer.index), "：", ":", "|", "."),
    vscode.languages.registerHoverProvider("yanxu", createHoverProvider(workspaceIndexer.index)),
    vscode.languages.registerDefinitionProvider("yanxu", createDefinitionProvider(workspaceIndexer.index)),
    vscode.languages.registerWorkspaceSymbolProvider(createWorkspaceSymbolProvider(workspaceIndexer.index)),
    vscode.workspace.registerTextDocumentContentProvider("yanxu-stdlib", {
      provideTextDocumentContent(uri) {
        return workspaceIndexer.index.standardContent(uri.toString());
      }
    }),
    vscode.languages.registerSignatureHelpProvider(
      "yanxu",
      createSignatureHelpProvider(workspaceIndexer.index),
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
    vscode.commands.registerCommand("yanxu.rebuildIndex", async () => {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "正在重建言序符号索引" },
        () => workspaceIndexer.rebuild()
      );
      vscode.window.showInformationMessage(`言序索引已重建：${result.files} 个文卷，${result.symbols} 个用户符号。`);
    }),
    vscode.commands.registerCommand("yanxu.showLanguageServerOutput", () => languageOutput.show()),
    vscode.commands.registerCommand("yanxu.openDocs", () => vscode.env.openExternal(vscode.Uri.parse("https://docs.yanxu.dev/")))
  );

  syncLanguageStatusVisibility();
  await Promise.all([workspaceIndexer.initialize(), startLanguageServer({ notify: false })]);
}

async function deactivate() {
  await stopLanguageServer();
}

module.exports = { activate, deactivate };
