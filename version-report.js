function parseVersionReport(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value.version === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

module.exports = { parseVersionReport };
