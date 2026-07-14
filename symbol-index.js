const path = require("node:path");
const { pinyin } = require("pinyin-pro");

const IDENTIFIER = "[^\\s（）()【】\\[\\]{}，,:：.；;「」“”\\\"<>]+";
const MODIFIERS = "(?:(?:公|私|只|静)\\s+)*";

function romanize(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { full: "", initials: "", filterText: "" };
  }
  try {
    const options = { toneType: "none", type: "array", nonZh: "consecutive", v: true };
    const full = pinyin(text, options).join("").toLowerCase();
    const initials = pinyin(text, { ...options, pattern: "first" }).join("").toLowerCase();
    return {
      full,
      initials,
      filterText: [...new Set([text, full, initials].filter(Boolean))].join(" "),
    };
  } catch {
    return { full: text.toLowerCase(), initials: text.toLowerCase(), filterText: text };
  }
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function matchesSymbol(symbol, query) {
  const needle = normalizeQuery(query);
  if (!needle) return true;
  return [symbol.name, symbol.pinyin, symbol.initials, symbol.container, symbol.detail]
    .filter(Boolean)
    .some((part) => normalizeQuery(part).includes(needle));
}

function stripGeneric(type) {
  const primary = String(type || "").trim().split(/[|?]/, 1)[0].split("<", 1)[0];
  const qualified = primary.split(/\s*\.\s*/).filter(Boolean).at(-1) || "";
  const match = qualified.match(new RegExp(IDENTIFIER));
  return match ? match[0] : "";
}

function parseParameters(raw) {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(new RegExp(`^(${IDENTIFIER})(?:\\s*[：:]\\s*(.+))?$`));
      return match
        ? { name: match[1], type: match[2] ? match[2].trim() : "" }
        : { name: part, type: "" };
    });
}

function inferType(expression) {
  const value = String(expression || "").trim();
  const construct = value.match(new RegExp(`^(?:${IDENTIFIER}\\s*\\.\\s*)?(${IDENTIFIER})\\s*(?:（|\\()`));
  if (construct) return construct[1];
  if (/^[+-]?\d+$/.test(value)) return "整";
  if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) return "浮";
  if (/^[「“\"]/.test(value)) return "文";
  if (/^(?:真|假)$/.test(value)) return "真";
  return "";
}

function blockDelta(line) {
  const opens = (String(line).match(/(?:^|[\s；;])则(?=\s|[；;]|$)/g) || []).length;
  const closes = (String(line).match(/(?:^|[\s；;])终(?=\s|[；;]|$)/g) || []).length;
  return opens - closes;
}

function createSymbol(properties) {
  const search = romanize(properties.name);
  return {
    documentation: "",
    detail: "",
    type: "",
    parameters: [],
    exported: false,
    container: "",
    scopeId: "",
    extends: "",
    ...properties,
    pinyin: search.full,
    initials: search.initials,
    filterText: search.filterText,
  };
}

function parseDocument(text, uri, fsPath = "") {
  const lines = String(text || "").split(/\r?\n/);
  const symbols = [];
  const imports = [];
  const stack = [];
  let documentation = [];

  const currentContainer = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].symbol) return stack[index].symbol;
    }
    return undefined;
  };
  const takeDocumentation = () => {
    const value = documentation.join("\n").trim();
    documentation = [];
    return value;
  };
  const add = (line, match, properties) => {
    const name = properties.name;
    const character = Math.max(0, line.indexOf(name, match.index || 0));
    const symbol = createSymbol({
      uri,
      fsPath,
      line: properties.line ?? lines.indexOf(line),
      character,
      endCharacter: character + name.length,
      endLine: properties.line ?? lines.indexOf(line),
      documentation: takeDocumentation(),
      ...properties,
    });
    symbols.push(symbol);
    return symbol;
  };

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const trimmed = line.trim();
    const docMatch = trimmed.match(/^\/\/\/\s?(.*)$/);
    if (docMatch) {
      documentation.push(docMatch[1]);
      continue;
    }
    if (/^终(?:\s|[；;]|$)/.test(trimmed)) {
      const closeCount = Math.max(1, -blockDelta(line));
      for (let count = 0; count < closeCount; count += 1) {
        const ended = stack.pop();
        if (ended?.symbol) ended.symbol.endLine = lineNumber;
      }
      documentation = [];
      continue;
    }
    if (!trimmed || /^\/\//.test(trimmed)) continue;

    const container = currentContainer();
    const common = {
      line: lineNumber,
      container: container ? container.name : "",
      scopeId: container ? `${container.uri}:${container.line}:${container.name}` : "",
    };
    let match;

    match = line.match(new RegExp(`^\\s*(公\\s+)?引\\s*[「\"]([^」\"]+)[」\"]\\s*为\\s*(${IDENTIFIER})`));
    if (match) {
      const alias = match[3];
      const symbol = add(line, match, {
        ...common,
        name: alias,
        kind: "module",
        detail: `引「${match[2]}」`,
        exported: Boolean(match[1]),
      });
      imports.push({
        source: match[2],
        alias,
        standard: match[2].startsWith("标准:"),
        moduleName: match[2].startsWith("标准:") ? match[2].slice(3) : "",
        uri,
        line: lineNumber,
        character: symbol.character,
        symbol,
        resolvedUri: "",
      });
      continue;
    }

    match = line.match(new RegExp(`^\\s*(公\\s+)?${MODIFIERS}(类|协)\\s+(${IDENTIFIER})(?:\\s+承\\s+(${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})?))?(?:\\s+纳\\s+${IDENTIFIER}(?:\\s*[，,]\\s*${IDENTIFIER})*)?\\s+则`));
    if (match) {
      const symbol = add(line, match, {
        ...common,
        name: match[3],
        kind: match[2] === "协" ? "interface" : "class",
        detail: match[4] ? `${match[2]} ${match[3]} 承 ${match[4]}` : `${match[2]} ${match[3]}`,
        extends: stripGeneric(match[4]),
        exported: Boolean(match[1]),
      });
      const depth = Math.max(0, blockDelta(line));
      if (depth) {
        stack.push({ type: symbol.kind, symbol });
        for (let nested = 1; nested < depth; nested += 1) stack.push({ type: "block" });
      }
      continue;
    }

    match = line.match(new RegExp(`^\\s*(公\\s+)?${MODIFIERS}(异\\s+)?法\\s+(${IDENTIFIER})\\s*[（(]([^）)]*)[）)](?:\\s*[：:]\\s*([^则；;]+))?\\s*(则|[；;])?`));
    if (match) {
      const parameters = parseParameters(match[4]);
      const inType = container && (container.kind === "class" || container.kind === "interface");
      const signature = `${match[3]}（${match[4]}）${match[5] ? `：${match[5].trim()}` : ""}`;
      const symbol = add(line, match, {
        ...common,
        name: match[3],
        kind: inType ? "method" : "function",
        detail: `${match[2] ? "异 " : ""}法 ${signature}`,
        type: match[5] ? match[5].trim() : "",
        parameters,
        exported: Boolean(match[1]),
      });
      for (const parameter of parameters) {
        const parameterStart = Math.max(symbol.endCharacter, line.indexOf(parameter.name, symbol.endCharacter));
        symbols.push(createSymbol({
          uri,
          fsPath,
          line: lineNumber,
          character: parameterStart,
          endCharacter: parameterStart + parameter.name.length,
          endLine: lineNumber,
          name: parameter.name,
          kind: "parameter",
          detail: parameter.type ? `${parameter.name}：${parameter.type}` : parameter.name,
          type: parameter.type,
          container: symbol.name,
          scopeId: `${symbol.uri}:${symbol.line}:${symbol.name}`,
        }));
      }
      const depth = match[6] === "则" ? Math.max(0, blockDelta(line)) : 0;
      if (depth) {
        stack.push({ type: "function", symbol });
        for (let nested = 1; nested < depth; nested += 1) stack.push({ type: "block" });
      }
      continue;
    }

    match = line.match(new RegExp(`^\\s*(公\\s+)?${MODIFIERS}(域|令|定)\\s+(${IDENTIFIER})(?:\\s*[：:]\\s*([^=＝；;]+?))?(?:\\s*(?:=|＝|为)\\s*([^；;]*))?(?:\\s*[；;]|$)`));
    if (match) {
      const declaredType = match[4] ? match[4].trim() : "";
      const type = declaredType || inferType(match[5]);
      const kind = match[2] === "域" ? "field" : match[2] === "定" ? "constant" : "variable";
      add(line, match, {
        ...common,
        name: match[3],
        kind,
        detail: `${match[2]} ${match[3]}${type ? `：${type}` : ""}`,
        type,
        exported: Boolean(match[1]),
      });
      continue;
    }

    let depth = Math.max(0, blockDelta(line));
    if (/^(?:否则|救)(?:\s|$)/.test(trimmed)) depth = Math.max(0, depth - 1);
    for (let nested = 0; nested < depth; nested += 1) stack.push({ type: "block" });
    documentation = [];
  }

  while (stack.length) {
    const ended = stack.pop();
    if (ended.symbol) ended.symbol.endLine = Math.max(0, lines.length - 1);
  }
  return { uri, fsPath, text, lines, symbols, imports };
}

function standardUri(moduleName) {
  return `yanxu-stdlib:/${encodeURIComponent(moduleName)}.yx`;
}

function standardKind(member) {
  if (member.kind === "constant") return "constant";
  if (member.kind === "class") return "class";
  return "function";
}

function buildStandardDocument(module) {
  const uri = standardUri(module.name);
  const lines = [`/// ${module.description || `言序标准库：${module.name}`}`, `模块 ${module.name}；`, ""];
  const symbols = [createSymbol({
    name: module.name,
    kind: "module",
    uri,
    fsPath: "",
    line: 1,
    character: 3,
    endCharacter: 3 + module.name.length,
    endLine: 1,
    detail: `标准库模块 ${module.name}`,
    documentation: module.description || "",
    exported: true,
  })];

  for (const member of module.members || []) {
    const signature = String(member.signature || "");
    const isConstant = member.kind === "constant";
    const declaration = isConstant
      ? `公 定 ${member.name}${signature ? `：${signature}` : ""}；`
      : `公 法 ${member.name}${signature.replace(/^法/, "")}；`;
    const line = lines.length;
    lines.push(declaration);
    symbols.push(createSymbol({
      name: member.name,
      kind: standardKind(member),
      uri,
      fsPath: "",
      line,
      character: declaration.indexOf(member.name),
      endCharacter: declaration.indexOf(member.name) + member.name.length,
      endLine: line,
      detail: isConstant ? `定 ${member.name}${signature ? `：${signature}` : ""}` : `${member.name}${signature.replace(/^法/, "")}`,
      documentation: Array.isArray(member.errors) && member.errors.length
        ? `可能错误：${member.errors.join("、")}`
        : "",
      type: isConstant ? signature : "",
      parameters: isConstant ? [] : parseParameters((signature.match(/[（(]([^）)]*)[）)]/) || [])[1] || ""),
      container: module.name,
      exported: true,
    }));
  }
  return { uri, fsPath: "", text: `${lines.join("\n")}\n`, lines, symbols, imports: [] };
}

function isTopLevel(symbol) {
  return !symbol.container;
}

function isVisibleAt(symbol, line) {
  if (symbol.kind === "parameter") {
    return line >= symbol.line;
  }
  return symbol.line <= line || isTopLevel(symbol);
}

function scopeId(symbol) {
  return `${symbol.uri}:${symbol.line}:${symbol.name}`;
}

function enclosingFunctions(document, line) {
  return document.symbols
    .filter(
      (symbol) => ["function", "method"].includes(symbol.kind)
        && symbol.line <= line
        && symbol.endLine >= line,
    )
    .sort((a, b) => a.line - b.line);
}

function visibleDocumentSymbols(document, line) {
  const activeScopes = new Set(enclosingFunctions(document, line).map(scopeId));
  return document.symbols.filter((symbol) => {
    if (isTopLevel(symbol)) return true;
    return activeScopes.has(symbol.scopeId) && isVisibleAt(symbol, line);
  });
}

function locationKey(symbol) {
  return `${symbol.uri}:${symbol.line}:${symbol.character}:${symbol.name}`;
}

class SymbolIndex {
  constructor(catalog = { modules: [] }) {
    this.documents = new Map();
    this.standardDocuments = new Map();
    this.standardModules = new Map();
    this.setStandardLibrary(catalog);
  }

  setStandardLibrary(catalog) {
    this.standardDocuments.clear();
    this.standardModules.clear();
    for (const module of catalog && Array.isArray(catalog.modules) ? catalog.modules : []) {
      const document = buildStandardDocument(module);
      this.standardModules.set(module.name, document);
      this.standardDocuments.set(document.uri, document);
    }
  }

  updateDocument(uri, text, fsPath = "") {
    const parsed = parseDocument(text, uri, fsPath);
    this.documents.set(uri, parsed);
    return parsed;
  }

  removeDocument(uri) {
    this.documents.delete(uri);
  }

  clearDocuments() {
    this.documents.clear();
  }

  getDocument(uri) {
    return this.documents.get(uri) || this.standardDocuments.get(uri);
  }

  setImportTarget(documentUri, source, resolvedUri) {
    const document = this.documents.get(documentUri);
    if (!document) return;
    for (const item of document.imports) {
      if (item.source === source) item.resolvedUri = resolvedUri;
    }
  }

  allSymbols(includeStandard = true) {
    const result = [];
    for (const document of this.documents.values()) result.push(...document.symbols);
    if (includeStandard) {
      for (const document of this.standardDocuments.values()) result.push(...document.symbols);
    }
    return result;
  }

  standardModuleSymbols() {
    return [...this.standardModules.values()].map((document) => document.symbols[0]);
  }

  moduleMembers(document) {
    if (!document) return [];
    return document.symbols.filter((symbol) => isTopLevel(symbol) && symbol.exported && symbol.kind !== "module");
  }

  findClass(name, preferredUri = "") {
    const candidates = this.allSymbols(false).filter(
      (symbol) => (symbol.kind === "class" || symbol.kind === "interface") && symbol.name === name,
    );
    return candidates.find((symbol) => symbol.uri === preferredUri) || candidates[0];
  }

  classMembers(classSymbol, includePrivate = false, seen = new Set()) {
    if (!classSymbol || seen.has(locationKey(classSymbol))) return [];
    seen.add(locationKey(classSymbol));
    const document = this.getDocument(classSymbol.uri);
    const own = document
      ? document.symbols.filter(
          (symbol) => symbol.container === classSymbol.name
            && ["method", "field", "constant", "variable"].includes(symbol.kind)
            && (includePrivate || symbol.exported),
        )
      : [];
    const parent = classSymbol.extends ? this.findClass(classSymbol.extends, classSymbol.uri) : undefined;
    return [...own, ...this.classMembers(parent, includePrivate, seen)];
  }

  findVisibleSymbol(documentUri, name, line = Number.MAX_SAFE_INTEGER) {
    const document = this.documents.get(documentUri);
    if (!document) return undefined;
    const candidates = visibleDocumentSymbols(document, line).filter(
      (symbol) => symbol.name === name && symbol.kind !== "module",
    );
    return candidates.sort((a, b) => {
      const scope = Number(Boolean(b.scopeId)) - Number(Boolean(a.scopeId));
      return scope || b.line - a.line;
    })[0];
  }

  membersForQualifier(documentUri, qualifier, line = Number.MAX_SAFE_INTEGER) {
    const document = this.documents.get(documentUri);
    if (!document) return [];
    const imported = document.imports.find((item) => item.alias === qualifier);
    if (imported) {
      if (imported.standard) {
        const standard = this.standardModules.get(imported.moduleName);
        return standard ? standard.symbols.slice(1) : [];
      }
      return this.moduleMembers(this.documents.get(imported.resolvedUri));
    }

    if (qualifier === "此") {
      const enclosing = [...document.symbols]
        .filter((symbol) => symbol.kind === "class" && symbol.line <= line && symbol.endLine >= line)
        .sort((a, b) => b.line - a.line)[0];
      return this.classMembers(enclosing, true);
    }

    const value = this.findVisibleSymbol(documentUri, qualifier, line);
    const typeName = value && stripGeneric(value.type);
    const classSymbol = typeName
      ? this.findClass(typeName, documentUri)
      : this.findClass(qualifier, documentUri);
    return this.classMembers(classSymbol, Boolean(classSymbol && classSymbol.uri === documentUri));
  }

  completionSymbols(documentUri, line = Number.MAX_SAFE_INTEGER, includeCurrent = true) {
    const document = this.documents.get(documentUri);
    const result = [];
    if (document && includeCurrent) {
      result.push(...visibleDocumentSymbols(document, line));
    }
    if (document) {
      for (const item of document.imports) result.push(item.symbol);
    }
    for (const candidate of this.documents.values()) {
      if (candidate.uri === documentUri) continue;
      result.push(...this.moduleMembers(candidate));
    }
    return [...new Map(result.map((symbol) => [locationKey(symbol), symbol])).values()];
  }

  definitions(documentUri, name, qualifier = "", line = Number.MAX_SAFE_INTEGER) {
    const document = this.documents.get(documentUri);
    if (!document) return [];
    if (qualifier) {
      return this.membersForQualifier(documentUri, qualifier, line).filter((symbol) => symbol.name === name);
    }
    const imported = document.imports.find((item) => item.alias === name);
    if (imported) {
      if (imported.standard) {
        const target = this.standardModules.get(imported.moduleName);
        return target ? [target.symbols[0]] : [];
      }
      const target = this.documents.get(imported.resolvedUri);
      return target && target.symbols.length ? [target.symbols[0]] : [];
    }
    const local = this.findVisibleSymbol(documentUri, name, line);
    if (local) return [local];
    return this.allSymbols(false).filter(
      (symbol) => symbol.name === name && symbol.exported && isTopLevel(symbol),
    );
  }

  workspaceSymbols(query) {
    return this.allSymbols(true)
      .filter((symbol) => matchesSymbol(symbol, query))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }

  signature(documentUri, name, qualifier = "", line = Number.MAX_SAFE_INTEGER) {
    const symbols = qualifier
      ? this.membersForQualifier(documentUri, qualifier, line)
      : this.definitions(documentUri, name, "", line);
    return symbols.find((symbol) => symbol.name === name && ["function", "method"].includes(symbol.kind));
  }

  standardContent(uri) {
    const document = this.standardDocuments.get(uri);
    return document ? document.text : "";
  }
}

function callAt(source) {
  const text = String(source || "");
  let depth = 0;
  let commaCount = 0;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const character = text[index];
    if (character === "）" || character === ")") depth += 1;
    else if (character === "（" || character === "(") {
      if (depth === 0) {
        const before = text.slice(0, index).match(new RegExp(`(?:(${IDENTIFIER})\\s*\\.\\s*)?(${IDENTIFIER})\\s*$`));
        return before
          ? { qualifier: before[1] || "", name: before[2], activeParameter: commaCount }
          : undefined;
      }
      depth -= 1;
    } else if (depth === 0 && (character === "，" || character === ",")) {
      commaCount += 1;
    }
  }
  return undefined;
}

function resolveImportCandidates(currentFsPath, source) {
  if (!currentFsPath || !source || source.startsWith("标准:")) return [];
  const base = path.resolve(path.dirname(currentFsPath), source);
  return [...new Set([
    base,
    base.endsWith(".yx") ? base : `${base}.yx`,
    path.join(base, "主.yx"),
  ])];
}

module.exports = {
  SymbolIndex,
  callAt,
  matchesSymbol,
  parseDocument,
  resolveImportCandidates,
  romanize,
  standardUri,
  stripGeneric,
};
