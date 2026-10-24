const DIAGNOSTIC_PATTERNS = Object.freeze({
  span: Object.freeze({
    message: "^(词法有误|语法有误|语义有误|类型有误|运行有误|VM 运行有误|编译有误)：(.*)$",
    location: "^\\s+-->\\s+(.+):(\\d+):(\\d+)\\s*$"
  }),
  deprecation: "^(提示|警告|错误)\\[([A-Za-z0-9]+)\\]\\s+(.+):(\\d+):(\\d+)：(.*)$"
});

function parseDiagnostics(text) {
  const lines = String(text || "").split(/\r?\n/);
  const messagePattern = new RegExp(DIAGNOSTIC_PATTERNS.span.message);
  const locationPattern = new RegExp(DIAGNOSTIC_PATTERNS.span.location);
  const deprecationPattern = new RegExp(DIAGNOSTIC_PATTERNS.deprecation);
  const diagnostics = [];
  for (let index = 0; index < lines.length; index += 1) {
    const deprecation = lines[index].match(deprecationPattern);
    if (deprecation) {
      diagnostics.push({
        severity: deprecation[1] === "错误" ? "error" : deprecation[1] === "提示" ? "info" : "warning",
        code: deprecation[2],
        file: deprecation[3],
        line: Number(deprecation[4]),
        column: Number(deprecation[5]),
        message: deprecation[6]
      });
      continue;
    }
    const message = lines[index].match(messagePattern);
    const location = lines[index + 1]?.match(locationPattern);
    if (!message || !location) continue;
    diagnostics.push({
      severity: "error",
      code: "",
      file: location[1],
      line: Number(location[2]),
      column: Number(location[3]),
      message: `${message[1]}：${message[2]}`
    });
    index += 1;
  }
  return diagnostics;
}

module.exports = { DIAGNOSTIC_PATTERNS, parseDiagnostics };
