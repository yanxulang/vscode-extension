const { execFile } = require("node:child_process");

function runProcess(command, args, options = {}) {
  const { cwd, token, timeout, maxBuffer = 8 * 1024 * 1024 } = options;
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      { cwd, timeout, maxBuffer, encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve({
          code: !error ? 0 : typeof error.code === "number" ? error.code : 1,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          error: error && typeof error.code !== "number" ? String(error.code || error.message) : ""
        });
      }
    );
    if (!token) return;
    const kill = () => {
      child.kill();
    };
    if (token.isCancellationRequested) kill();
    else token.onCancellationRequested(kill);
  });
}

module.exports = { runProcess };
