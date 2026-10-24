const vscode = require("vscode");
const { runProcess } = require("./process-run");
const { configuration, executablePath } = require("./runtime");
const { parseVersionReport } = require("./version-report");

function registerToolchain(context) {
  const output = vscode.window.createOutputChannel("言序工具链");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  let lastReport = "";

  function showStatus() {
    const editorIsYanxu = vscode.window.activeTextEditor?.document.languageId === "yanxu";
    if (editorIsYanxu || status.text.includes("未找到")) status.show();
    else status.hide();
  }

  async function refresh() {
    const command = executablePath();
    const result = await runProcess(command, ["版本", "--json"], { timeout: 8000 });
    const version = parseVersionReport(result.stdout);
    lastReport = [`$ ${command} 版本 --json`, result.stdout || result.stderr || result.error || "没有输出"].join("\n");
    if (version) {
      status.text = `言序 ${version.version}`;
      status.tooltip = "点击查看言序工具链";
      status.command = "yanxu.showToolchain";
    } else {
      status.text = "$(alert) 言序未找到";
      status.tooltip = "点击选择言序程序";
      status.command = "yanxu.selectExecutable";
    }
    showStatus();
  }

  async function selectExecutable() {
    const picked = await vscode.window.showQuickPick([
      { label: "从 PATH 使用 yanxu", description: "yanxu", target: "yanxu" },
      { label: "选择可执行文件…", description: "浏览本机程序", target: "" }
    ], { title: "选择言序程序" });
    if (!picked) return;
    let target = picked.target;
    if (!target) {
      const file = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        openLabel: "用作言序程序"
      });
      if (!file?.[0]) return;
      target = file[0].fsPath;
    }
    await configuration().update("executablePath", target, vscode.ConfigurationTarget.Global);
  }

  context.subscriptions.push(
    output,
    status,
    vscode.window.onDidChangeActiveTextEditor(showStatus),
    vscode.commands.registerCommand("yanxu.showToolchain", async () => {
      if (!lastReport) await refresh();
      output.clear();
      output.appendLine(lastReport);
      output.show();
    }),
    vscode.commands.registerCommand("yanxu.selectExecutable", selectExecutable),
    vscode.commands.registerCommand("yanxu.openDocs", () => vscode.env.openExternal(vscode.Uri.parse("https://docs.yanxu.dev/")))
  );

  return { refresh, showStatus };
}

module.exports = { registerToolchain };
