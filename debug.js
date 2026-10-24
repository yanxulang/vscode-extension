const vscode = require("vscode");
const { activeFile, ensureTrusted, executablePath } = require("./runtime");

function launchConfig(program, stopOnEntry) {
  return {
    type: "yanxu",
    request: "launch",
    name: stopOnEntry ? "调试当前言序文卷并在入口暂停" : "调试当前言序文卷",
    program,
    stopOnEntry
  };
}

async function startDebugging() {
  if (!(await ensureTrusted("调试言序文卷前需要信任此工作区。"))) return;
  const file = await activeFile();
  if (!file) return;
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
  await vscode.debug.startDebugging(folder, launchConfig(file, false));
}

function registerDebug(context) {
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("yanxu", {
      provideDebugConfigurations() {
        return [launchConfig("${file}", false), launchConfig("${file}", true)];
      },
      resolveDebugConfiguration(_folder, config) {
        if (!config.type && !config.request && !config.name) {
          Object.assign(config, launchConfig("${file}", false));
        }
        if (!config.program) {
          const editor = vscode.window.activeTextEditor;
          if (!editor || editor.document.languageId !== "yanxu" || editor.document.isUntitled) return undefined;
          config.program = editor.document.fileName;
        }
        config.type ||= "yanxu";
        config.request ||= "launch";
        if (typeof config.stopOnEntry !== "boolean") config.stopOnEntry = false;
        return config;
      }
    }),
    vscode.debug.registerDebugAdapterDescriptorFactory("yanxu", {
      createDebugAdapterDescriptor() {
        return new vscode.DebugAdapterExecutable(executablePath(), ["调试服务"]);
      }
    }),
    vscode.commands.registerCommand("yanxu.startDebugging", startDebugging)
  );
}

module.exports = { registerDebug };
