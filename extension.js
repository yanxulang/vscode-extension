const vscode = require("vscode");
const { registerDebug } = require("./debug");
const { registerEditorFeatures } = require("./editor-features");
const { createLanguageService } = require("./language-client");
const { registerRunner } = require("./runner");
const { registerTesting } = require("./testing");
const { registerToolchain } = require("./toolchain");
const { WorkspaceIndexer } = require("./workspace-indexer");

let language;

async function activate(context) {
  const output = vscode.window.createOutputChannel("言序语言服务");
  const indexer = new WorkspaceIndexer(output);
  language = createLanguageService({ output, symbolIndex: () => indexer.index });
  const toolchain = registerToolchain(context);
  context.subscriptions.push(
    output,
    language.status,
    indexer,
    vscode.commands.registerCommand("yanxu.restartLanguageServer", () => language.restart()),
    vscode.commands.registerCommand("yanxu.showLanguageServerOutput", () => output.show()),
    vscode.window.onDidChangeActiveTextEditor(() => {
      language.syncVisibility();
      toolchain.showStatus();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("yanxu.executablePath") || event.affectsConfiguration("yanxu.languageServer.enabled")) {
        language.start();
        toolchain.refresh();
      }
      if (event.affectsConfiguration("yanxu.index") || event.affectsConfiguration("yanxu.executablePath")) {
        indexer.refreshConfiguration();
      }
    })
  );
  registerEditorFeatures(context, { indexer, languageRunning: () => language.running() });
  registerRunner(context);
  registerDebug(context);
  registerTesting(context);
  language.syncVisibility();
  toolchain.showStatus();
  await Promise.all([
    indexer.initialize(),
    language.start({ notify: false }),
    toolchain.refresh()
  ]);
}

async function deactivate() {
  await language?.stop();
}

module.exports = { activate, deactivate };
