const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_NAME = "言序.toml";

function findManifestDirectory(start, exists = fs.existsSync, boundary) {
  if (!start) return undefined;
  let current = path.resolve(start);
  const root = path.parse(current).root;
  const stop = boundary ? path.resolve(boundary) : undefined;
  while (true) {
    if (exists(path.join(current, MANIFEST_NAME))) return current;
    if ((stop && current === stop) || current === root) return undefined;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function hasManifest(root, exists = fs.existsSync) {
  return Boolean(root) && exists(path.join(root, MANIFEST_NAME));
}

function projectRoot(start, exists = fs.existsSync, boundary) {
  if (!start) return undefined;
  return findManifestDirectory(start, exists, boundary) || path.resolve(start);
}

function testDirectory(start, exists = fs.existsSync) {
  const root = projectRoot(start, exists);
  if (!root) return undefined;
  const spec = path.join(root, "spec");
  return exists(spec) ? spec : root;
}

function compatibilityDirectory(start, exists = fs.existsSync) {
  const root = projectRoot(start, exists);
  return root ? path.join(root, "compat") : undefined;
}

module.exports = {
  MANIFEST_NAME,
  compatibilityDirectory,
  findManifestDirectory,
  hasManifest,
  projectRoot,
  testDirectory
};
