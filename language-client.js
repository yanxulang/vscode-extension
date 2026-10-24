const vscode = require("vscode");
const { LanguageClient, State } = require("vscode-languageclient/node");
const { enrichCompletionResult } = require("./completion-edit");
const { executablePath, pinyinEnabled } = require("./runtime");

function createLanguageService({ output, symbolIndex }) {
  let client;
  let clientWatcher;
  let clientStateSubscription;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.command = "yanxu.restartLanguageServer";

  function languageServerEnabled() {
    return vscode.workspace.getConfiguration("yanxu").get("languageServer.enabled", true);
  }

  function running() {
    return client?.state === State.Running;
  }

  function updateStatus(state, detail) {
    const states = {
      starting: ["$(sync~spin) 言序", "言序语言服务正在启动", "请稍候"],
      running: ["$(check) 言序", "言序语言服务已连接", "点击可重启"],
      stopped: ["$(debug-disconnect) 言序", "言序语言服务未连接", "点击可重启"],
      disabled: ["$(circle-slash) 言序", "言序语言服务已停用", "点击可启用"],
      failed: ["$(error) 言序", "言序语言服务启动失败", "点击可重试"]
    };
    const [text, tooltip, action] = states[state] ?? states.stopped;
    status.text = text;
    status.tooltip = detail ? `${tooltip}\n${detail}\n${action}` : `${tooltip}\n${action}`;
  }

  function syncVisibility() {
    if (vscode.window.activeTextEditor?.document.languageId === "yanxu") status.show();
    else status.hide();
  }

  async function stop() {
    clientStateSubscription?.dispose();
    clientStateSubscription = undefined;
    clientWatcher?.dispose();
    clientWatcher = undefined;
    if (!client) return;
    const current = client;
    client = undefined;
    await current.stop().catch((error) => output.appendLine(`停止语言服务失败：${error.message}`));
  }

  async function start({ notify = true } = {}) {
    await stop();
    if (!languageServerEnabled()) {
      updateStatus("disabled");
      return;
    }

    updateStatus("starting");
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
        outputChannel: output,
        middleware: {
          async provideCompletionItem(document, position, context, token, next) {
            const result = await next(document, position, context, token);
            return enrichCompletionResult(
              result,
              document,
              position,
              symbolIndex(),
              pinyinEnabled()
            );
          }
        }
      }
    );
    client = nextClient;
    clientStateSubscription = nextClient.onDidChangeState(({ newState }) => {
      if (newState === State.Running) updateStatus("running");
      else if (newState === State.Stopped) updateStatus("stopped");
      else updateStatus("starting");
    });

    try {
      await nextClient.start();
    } catch (error) {
      if (client === nextClient) client = undefined;
      clientStateSubscription?.dispose();
      clientStateSubscription = undefined;
      clientWatcher?.dispose();
      clientWatcher = undefined;
      output.appendLine(`启动语言服务失败：${error.stack ?? error.message}`);
      updateStatus("failed", error.message);
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
        output.show();
      } else if (choice === "停用语言服务") {
        vscode.workspace.getConfiguration("yanxu").update("languageServer.enabled", false, vscode.ConfigurationTarget.Global);
      }
    }
  }

  async function restart() {
    if (!languageServerEnabled()) {
      await vscode.workspace.getConfiguration("yanxu").update(
        "languageServer.enabled",
        true,
        vscode.ConfigurationTarget.Global
      );
      return;
    }
    await start();
    if (client) vscode.window.showInformationMessage("言序语言服务已重启。");
  }

  return {
    output,
    running,
    start,
    stop,
    restart,
    syncVisibility,
    status
  };
}

module.exports = { createLanguageService };
