const path = require("node:path");

function clip(text, limit = 4000) {
  const value = String(text || "");
  return value.length > limit ? `${value.slice(0, limit)}\n…` : value;
}

function parseTestReport(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let report;
  try {
    report = JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (!report || !Array.isArray(report.tests)) return undefined;
  return report;
}

function samePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  return path.normalize(path.resolve(left)) === path.normalize(path.resolve(right));
}

function matchingCase(report, file) {
  return report?.tests?.find((entry) => typeof entry?.path === "string" && samePath(entry.path, file));
}

module.exports = { clip, matchingCase, parseTestReport, samePath };
