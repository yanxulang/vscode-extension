const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const { indexedCompletionSymbols, indexedInsertText } = require("./completion-edit");
const { codeLensesFor } = require("./codelens-model");
const { importLinkRanges } = require("./import-links");
const {
  completionEntries,
  lookupLanguageSymbol,
  signatureAt
} = require("./language-features");
const { codeLensEnabled, pinyinEnabled } = require("./runtime");
const { callAt, parseDocument, resolveImportCandidates, romanize, standardUri } = require("./symbol-index");

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

function wordRange(document, position) {
  return document.getWordRangeAtPosition(position, /[^\s（）()【】\[\]{}，,:：.；;"“”「」]+/);
}

function qualifierBefore(document, range) {
  const prefix = document.lineAt(range.start.line).text.slice(0, range.start.character);
  return prefix.match(/([^\s（）()【】\[\]{}，,:：.；;"“”「」]+)\s*\.\s*$/)?.[1] ?? "";
}

function symbolLocation(symbol) {
  const uri = vscode.Uri.parse(symbol.uri);
  const start = new vscode.Position(symbol.line, symbol.character);
  const end = new vscode.Position(symbol.line, symbol.endCharacter);
  return new vscode.Location(uri, new vscode.Range(start, end));
}

function importTarget(document, item, indexed) {
  const known = indexed?.imports?.find((candidate) => candidate.source === item.source && candidate.line === item.line);
  if (known?.resolvedUri) return known.resolvedUri;
  if (item.standard && item.moduleName) return standardUri(item.moduleName);
  if (document.uri.scheme !== "file" || item.source.startsWith("包:")) return "";
  const candidate = resolveImportCandidates(document.uri.fsPath, item.source).find((file) => fs.existsSync(file));
  return candidate ? vscode.Uri.file(candidate).toString() : "";
}

function registerEditorFeatures(context, { indexer, languageRunning }) {
  const symbolIndex = () => indexer.index;
  const lensesChanged = new vscode.EventEmitter();

  function serverRunning() {
    return languageRunning();
  }

  context.subscriptions.push(
    lensesChanged,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("yanxu.codeLens")) lensesChanged.fire();
    }),
    vscode.languages.registerCompletionItemProvider("yanxu", {
      provideCompletionItems(document, position) {
        if (serverRunning()) return undefined;
        const index = symbolIndex();
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const indexed = indexedCompletionSymbols(index, document, position);
        const seen = new Set(indexed.map((symbol) => symbol.name));
        const baseItems = completionEntries(linePrefix).filter((entry) => !seen.has(entry.label)).map((entry) => {
          const item = new vscode.CompletionItem(entry.label, completionKind(entry.kind));
          item.detail = entry.detail;
          item.documentation = languageDocumentation(entry);
          item.sortText = `${entry.kind === "function" ? "1" : "2"}-${entry.label}`;
          item.filterText = pinyinEnabled() ? romanize(entry.label).filterText : entry.label;
          if (entry.insertText) item.insertText = new vscode.SnippetString(entry.insertText);
          return item;
        });
        const indexedItems = indexed.map((symbol) => {
          const item = new vscode.CompletionItem(symbol.name, completionKind(symbol.kind));
          const origin = symbol.fsPath ? path.basename(symbol.fsPath) : "标准库";
          item.detail = `言序索引 · ${symbol.detail || symbol.kind} · ${origin}`;
          item.documentation = indexedDocumentation(symbol);
          item.sortText = `0-${symbol.name}`;
          item.filterText = pinyinEnabled() ? symbol.filterText : symbol.name;
          const insertText = indexedInsertText(symbol);
          item.insertText = ["function", "method"].includes(symbol.kind)
            ? new vscode.SnippetString(insertText)
            : insertText;
          return item;
        });
        return [...indexedItems, ...baseItems];
      }
    }, "：", ":", "|", "."),
    vscode.languages.registerHoverProvider("yanxu", {
      provideHover(document, position) {
        const range = wordRange(document, position);
        if (!range) return undefined;
        const name = document.getText(range);
        const entry = lookupLanguageSymbol(name);
        if (entry) return new vscode.Hover(languageDocumentation(entry), range);
        if (serverRunning()) return undefined;
        const symbol = symbolIndex().definitions(
          document.uri.toString(),
          name,
          qualifierBefore(document, range),
          position.line
        )[0];
        return symbol ? new vscode.Hover(indexedDocumentation(symbol), range) : undefined;
      }
    }),
    vscode.languages.registerSignatureHelpProvider("yanxu", {
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
        const symbol = symbolIndex().signature(document.uri.toString(), call.name, call.qualifier, position.line);
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
    }, "（", "(", "，", ","),
    vscode.languages.registerDefinitionProvider("yanxu", {
      provideDefinition(document, position) {
        const range = wordRange(document, position);
        if (!range) return undefined;
        const targets = symbolIndex().definitions(
          document.uri.toString(),
          document.getText(range),
          qualifierBefore(document, range),
          position.line
        );
        const useful = serverRunning()
          ? targets.filter((symbol) => String(symbol.uri).startsWith("yanxu-stdlib:"))
          : targets;
        return useful.length ? useful.map(symbolLocation) : undefined;
      }
    }),
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols(query) {
        return symbolIndex().workspaceSymbols(query).map((symbol) => new vscode.SymbolInformation(
          symbol.name,
          symbolKind(symbol.kind),
          symbol.container || "言序",
          symbolLocation(symbol)
        ));
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider("yanxu-stdlib", {
      provideTextDocumentContent(uri) {
        return symbolIndex().standardContent(uri.toString());
      }
    }),
    vscode.languages.registerDocumentLinkProvider("yanxu", {
      provideDocumentLinks(document) {
        const key = document.uri.toString();
        const fsPath = document.uri.scheme === "file" ? document.uri.fsPath : "";
        const parsed = parseDocument(document.getText(), key, fsPath);
        const indexed = symbolIndex().getDocument(key);
        const imports = parsed.imports.map((item) => ({
          ...item,
          target: importTarget(document, item, indexed)
        }));
        return importLinkRanges(document.getText(), imports).map((link) => {
          const range = new vscode.Range(link.line, link.start, link.line, link.end);
          const documentLink = new vscode.DocumentLink(range, vscode.Uri.parse(link.target));
          documentLink.tooltip = link.target.startsWith("yanxu-stdlib:") ? "打开标准库模块" : "打开导入的模块";
          return documentLink;
        });
      }
    }),
    vscode.languages.registerCodeLensProvider("yanxu", {
      onDidChangeCodeLenses: lensesChanged.event,
      provideCodeLenses(document) {
        const filePath = document.uri.scheme === "file" ? document.uri.fsPath : "";
        return codeLensesFor(document.getText(), filePath, codeLensEnabled()).map((lens) => {
          const range = new vscode.Range(lens.line, 0, lens.line, 0);
          return new vscode.CodeLens(range, { title: lens.title, command: lens.command });
        });
      }
    }),
    vscode.languages.registerCodeActionsProvider("yanxu", {
      provideCodeActions(document, _range, context) {
        const deprecated = context.diagnostics.filter((diagnostic) => {
          const code = typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code;
          return /弃用|YXD\d+/.test(`${code || ""} ${diagnostic.message}`);
        });
        if (!deprecated.length || document.isUntitled) return [];
        const action = new vscode.CodeAction("迁移弃用语法", vscode.CodeActionKind.QuickFix);
        action.command = { command: "yanxu.migrateFile", title: "迁移弃用语法" };
        action.diagnostics = deprecated;
        action.isPreferred = true;
        return [action];
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.commands.registerCommand("yanxu.rebuildIndex", async () => {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "正在重建言序符号索引" },
        () => indexer.rebuild()
      );
      vscode.window.showInformationMessage(`言序索引已重建：${result.files} 个文卷，${result.symbols} 个用户符号。`);
    })
  );
}

module.exports = { registerEditorFeatures };
