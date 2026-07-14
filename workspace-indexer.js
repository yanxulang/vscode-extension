const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const vscode = require("vscode");
const fallbackStandardLibrary = require("./resources/standard-library.json");
const { SymbolIndex, resolveImportCandidates } = require("./symbol-index");
const { resolvePackageImport } = require("./package-resolver");

const decoder = new TextDecoder("utf-8");

function fileExists(file) {
  return fs.stat(file).then((stat) => stat.isFile()).catch(() => false);
}

function configuration() {
  return vscode.workspace.getConfiguration("yanxu");
}

function isEnabled() {
  return configuration().get("index.enabled", true);
}

function maxFiles() {
  return Math.max(100, configuration().get("index.maxFiles", 5000));
}

function isExternal(uri) {
  return !vscode.workspace.getWorkspaceFolder(uri);
}

function executeStandardLibrary(command, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, ["标准库", "--json"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 8000,
    }, (error, stdout) => {
      if (error) reject(error);
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      }
    });
  });
}

class WorkspaceIndexer {
  constructor(output) {
    this.output = output;
    this.index = new SymbolIndex(fallbackStandardLibrary);
    this.disposables = [];
    this.externalWatchers = new Map();
    this.pending = new Map();
    this.rebuildPromise = undefined;
  }

  async initialize() {
    this.registerListeners();
    await this.loadStandardLibrary();
    if (isEnabled()) await this.rebuild();
  }

  registerListeners() {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.yx");
    watcher.onDidCreate((uri) => this.indexFile(uri));
    watcher.onDidChange((uri) => this.indexFile(uri));
    watcher.onDidDelete((uri) => this.removeFile(uri));
    this.disposables.push(
      watcher,
      vscode.workspace.onDidOpenTextDocument((document) => this.updateOpenDocument(document)),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.scheduleDocument(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.updateOpenDocument(document)),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme === "untitled") this.index.removeDocument(document.uri.toString());
        else this.indexFile(document.uri);
      }),
    );
  }

  async loadStandardLibrary() {
    this.index.setStandardLibrary(fallbackStandardLibrary);
    if (!vscode.workspace.isTrusted) {
      this.output.appendLine("符号索引：工作区未受信任，使用扩展内置标准库索引。");
      return;
    }
    const command = configuration().get("executablePath", "yanxu");
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    try {
      const catalog = await executeStandardLibrary(command, cwd);
      if (!Array.isArray(catalog.modules)) throw new Error("缺少 modules 数组");
      this.index.setStandardLibrary(catalog);
      this.output.appendLine(`符号索引：已从 ${command} 载入 ${catalog.modules.length} 个标准库模块。`);
    } catch (error) {
      this.output.appendLine(`符号索引：无法读取当前 CLI 标准库，使用内置索引（${error.message}）。`);
    }
  }

  async rebuild() {
    if (this.rebuildPromise) return this.rebuildPromise;
    this.rebuildPromise = this.performRebuild().finally(() => {
      this.rebuildPromise = undefined;
    });
    return this.rebuildPromise;
  }

  async performRebuild() {
    this.index.clearDocuments();
    if (!isEnabled()) {
      this.output.appendLine("符号索引：已停用。");
      return { files: 0, symbols: 0 };
    }
    const limit = maxFiles();
    const uris = await vscode.workspace.findFiles("**/*.yx", "**/{.git,node_modules,target,dist,out,build}/**", limit);
    const visited = new Set();
    for (let start = 0; start < uris.length; start += 32) {
      await Promise.all(uris.slice(start, start + 32).map((uri) => this.indexFile(uri, visited)));
    }
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === "yanxu" && document.isDirty) this.updateOpenDocument(document);
    }
    const symbols = this.index.allSymbols(false).length;
    this.output.appendLine(`符号索引：已索引 ${this.index.documents.size} 个文卷、${symbols} 个用户符号。`);
    return { files: this.index.documents.size, symbols };
  }

  async readUri(uri) {
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (open) return open.getText();
    return decoder.decode(await vscode.workspace.fs.readFile(uri));
  }

  async resolveImport(currentUri, source) {
    if (currentUri.scheme !== "file") return undefined;
    if (source.startsWith("包:")) {
      const resolvedPackage = await resolvePackageImport(currentUri.fsPath, source);
      return resolvedPackage ? vscode.Uri.file(resolvedPackage) : undefined;
    }
    for (const candidate of resolveImportCandidates(currentUri.fsPath, source)) {
      if (await fileExists(candidate)) return vscode.Uri.file(candidate);
    }
    return undefined;
  }

  async indexFile(uri, visited = new Set()) {
    if (!isEnabled() || !uri || (uri.scheme !== "file" && uri.scheme !== "untitled")) return;
    const key = uri.toString();
    if (visited.has(key) || visited.size >= maxFiles()) return;
    visited.add(key);
    try {
      const text = await this.readUri(uri);
      const parsed = this.index.updateDocument(key, text, uri.scheme === "file" ? uri.fsPath : "");
      if (!configuration().get("index.includeExternalModules", true)) return;
      for (const imported of parsed.imports) {
        if (imported.standard) continue;
        const target = await this.resolveImport(uri, imported.source);
        if (!target) continue;
        this.index.setImportTarget(key, imported.source, target.toString());
        if (isExternal(target)) this.watchExternal(target);
        await this.indexFile(target, visited);
      }
    } catch (error) {
      this.output.appendLine(`符号索引：无法读取 ${uri.fsPath || key}（${error.message}）。`);
    }
  }

  updateOpenDocument(document) {
    if (!isEnabled() || document.languageId !== "yanxu") return;
    const key = document.uri.toString();
    const parsed = this.index.updateDocument(key, document.getText(), document.uri.scheme === "file" ? document.uri.fsPath : "");
    if (!configuration().get("index.includeExternalModules", true)) return;
    Promise.all(parsed.imports.filter((item) => !item.standard).map(async (item) => {
      const target = await this.resolveImport(document.uri, item.source);
      if (!target) return;
      this.index.setImportTarget(key, item.source, target.toString());
      if (isExternal(target)) this.watchExternal(target);
      await this.indexFile(target);
    })).catch((error) => this.output.appendLine(`符号索引：导入更新失败（${error.message}）。`));
  }

  scheduleDocument(document) {
    if (document.languageId !== "yanxu") return;
    const key = document.uri.toString();
    clearTimeout(this.pending.get(key));
    this.pending.set(key, setTimeout(() => {
      this.pending.delete(key);
      this.updateOpenDocument(document);
    }, 150));
  }

  removeFile(uri) {
    const key = uri.toString();
    this.index.removeDocument(key);
    this.externalWatchers.get(key)?.dispose();
    this.externalWatchers.delete(key);
  }

  watchExternal(uri) {
    const key = uri.toString();
    if (this.externalWatchers.has(key)) return;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(uri.fsPath), path.basename(uri.fsPath)),
    );
    watcher.onDidChange(() => this.indexFile(uri));
    watcher.onDidCreate(() => this.indexFile(uri));
    watcher.onDidDelete(() => this.removeFile(uri));
    this.externalWatchers.set(key, watcher);
  }

  async refreshConfiguration() {
    await this.loadStandardLibrary();
    return this.rebuild();
  }

  dispose() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    for (const watcher of this.externalWatchers.values()) watcher.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.pending.clear();
    this.externalWatchers.clear();
    this.disposables = [];
  }
}

module.exports = { WorkspaceIndexer };
