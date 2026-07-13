const vscode = require("vscode");

function executablePath() {
  return vscode.workspace.getConfiguration("yanxu").get("executablePath", "yanxu");
}

function activate(context) {
  const runFile = vscode.commands.registerCommand("yanxu.runFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "yanxu") {
      vscode.window.showWarningMessage("请先打开一个言序文卷（.yx）。");
      return;
    }

    if (vscode.workspace.getConfiguration("yanxu").get("saveBeforeRun", true)) {
      const saved = await editor.document.save();
      if (!saved) {
        vscode.window.showErrorMessage("文卷未能保存，已取消运行。");
        return;
      }
    }

    const terminal = vscode.window.createTerminal({
      name: `言序 · ${editor.document.fileName.split(/[\\/]/).pop()}`,
      shellPath: executablePath(),
      shellArgs: [editor.document.fileName]
    });
    terminal.show();
  });

  const openRepl = vscode.commands.registerCommand("yanxu.openRepl", () => {
    const terminal = vscode.window.createTerminal({ name: "言序 REPL", shellPath: executablePath() });
    terminal.show();
  });

  const openDocs = vscode.commands.registerCommand("yanxu.openDocs", () => {
    vscode.env.openExternal(vscode.Uri.parse("https://yanxulang.github.io/docs/"));
  });

  context.subscriptions.push(runFile, openRepl, openDocs);
}

function deactivate() {}

module.exports = { activate, deactivate };
