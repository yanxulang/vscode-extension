const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const MANIFEST_NAME = "言序.toml";
const LOCK_NAME = "言序.lock";

async function exists(file) {
  return fs.stat(file).then((stat) => stat.isFile()).catch(() => false);
}

async function findUp(start, name) {
  let directory = path.resolve(start);
  while (true) {
    const candidate = path.join(directory, name);
    if (await exists(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function parseScalar(value) {
  const match = String(value || "").trim().match(/^(?:"((?:\\.|[^"])*)"|'([^']*)')/);
  return match ? (match[1] ?? match[2]).replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
}

function parseLock(text) {
  return String(text || "")
    .split(/^\s*\[\[package\]\]\s*$/m)
    .slice(1)
    .map((block) => {
      const result = {};
      for (const line of block.split(/\r?\n/)) {
        const match = line.match(/^\s*(name|version|source|revision|checksum|entry)\s*=\s*(.+)$/);
        if (match) result[match[1]] = parseScalar(match[2]);
      }
      return result;
    })
    .filter((entry) => entry.name && entry.source && entry.entry);
}

function sectionName(line) {
  const match = line.match(/^\s*\[\s*["']?([^\]"']+)["']?\s*\]\s*$/);
  return match ? match[1].trim() : "";
}

function dependencyPath(manifest, packageName) {
  let dependencies = false;
  const lines = String(manifest || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const section = sectionName(line);
    if (section) {
      dependencies = section === "依赖" || section === "dependencies";
      continue;
    }
    if (!dependencies || /^\s*(?:#|$)/.test(line)) continue;
    const assignment = line.match(/^\s*["']?([^="']+?)["']?\s*=\s*(.+)$/);
    if (!assignment || assignment[1].trim() !== packageName) continue;
    let value = assignment[2].trim();
    while (value.startsWith("{") && !value.includes("}") && index + 1 < lines.length) {
      index += 1;
      value += ` ${lines[index].trim()}`;
    }
    if (/^["']/.test(value)) return parseScalar(value);
    const field = value.match(/(?:^|[{,]\s*)["']?(?:路径|path)["']?\s*=\s*((?:"(?:\\.|[^"])*")|(?:'[^']*'))/);
    return field ? parseScalar(field[1]) : "";
  }
  return "";
}

function packageEntry(manifest) {
  let packageSection = false;
  for (const line of String(manifest || "").split(/\r?\n/)) {
    const section = sectionName(line);
    if (section) {
      packageSection = section === "包" || section === "package";
      continue;
    }
    if (!packageSection) continue;
    const match = line.match(/^\s*["']?(?:入口|entry)["']?\s*=\s*(.+)$/);
    if (match) return parseScalar(match[1]);
  }
  return "";
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function cacheRoot() {
  return process.env.YANXU_CACHE || path.join(process.env.HOME || os.homedir(), ".yanxu", "缓存");
}

function rootFromLocked(manifestRoot, locked) {
  if (locked.source.startsWith("path:")) {
    return path.resolve(manifestRoot, locked.source.slice(5));
  }
  if (locked.source.startsWith("git:")) {
    const url = locked.source.slice(4);
    return path.join(cacheRoot(), "git", shortHash(url));
  }
  if (locked.source.startsWith("registry:")) {
    const registry = locked.source.slice(9);
    if (registry.startsWith("file://")) {
      return path.join(fileURLToPath(registry), locked.name, locked.version);
    }
    if (path.isAbsolute(registry)) return path.join(registry, locked.name, locked.version);
    return path.join(cacheRoot(), "registry", shortHash(registry), locked.name, locked.version);
  }
  return "";
}

async function resolveFromManifest(manifestPath, packageName) {
  const root = path.dirname(manifestPath);
  const manifest = await fs.readFile(manifestPath, "utf8");
  const relative = dependencyPath(manifest, packageName);
  if (!relative) return undefined;
  const resolvedDependencyPath = path.resolve(root, relative);
  const dependencyStat = await fs.stat(resolvedDependencyPath).catch(() => undefined);
  const dependencyRoot = dependencyStat?.isFile() ? path.dirname(resolvedDependencyPath) : resolvedDependencyPath;
  const dependencyManifestPath = path.join(dependencyRoot, MANIFEST_NAME);
  if (!await exists(dependencyManifestPath)) return undefined;
  const entry = packageEntry(await fs.readFile(dependencyManifestPath, "utf8"));
  if (!entry) return undefined;
  const candidate = path.join(dependencyRoot, entry);
  return await exists(candidate) ? candidate : undefined;
}

async function resolvePackageImport(currentFsPath, source) {
  if (!currentFsPath || !String(source).startsWith("包:")) return undefined;
  const packageName = String(source).slice(2);
  if (!packageName) return undefined;
  const manifestPath = await findUp(path.dirname(currentFsPath), MANIFEST_NAME);
  if (!manifestPath) return undefined;
  const root = path.dirname(manifestPath);
  const lockPath = path.join(root, LOCK_NAME);
  if (await exists(lockPath)) {
    const locked = parseLock(await fs.readFile(lockPath, "utf8")).find((entry) => entry.name === packageName);
    if (locked) {
      const resolvedRoot = rootFromLocked(root, locked);
      const resolvedStat = resolvedRoot && await fs.stat(resolvedRoot).catch(() => undefined);
      const packageRoot = resolvedStat?.isFile() ? path.dirname(resolvedRoot) : resolvedRoot;
      const candidate = packageRoot && path.join(packageRoot, locked.entry);
      if (candidate && await exists(candidate)) return candidate;
    }
  }
  return resolveFromManifest(manifestPath, packageName);
}

module.exports = {
  dependencyPath,
  packageEntry,
  parseLock,
  resolvePackageImport,
  rootFromLocked,
  shortHash,
};
