#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const executable = process.argv[2] || "yanxu";
const output = execFileSync(executable, ["标准库", "--json"], {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
const catalog = JSON.parse(output);
const version = JSON.parse(execFileSync(executable, ["version", "--json"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
}));

if (!Array.isArray(catalog.modules)) {
  throw new Error("标准库命令没有返回 modules 数组");
}

const normalized = {
  generatedAt: new Date().toISOString(),
  coreVersion: String(version.version || ""),
  modules: catalog.modules.map((module) => ({
    name: String(module.name),
    description: module.description ? String(module.description) : "",
    members: Array.isArray(module.members)
      ? module.members.map((member) => ({
          name: String(member.name),
          signature: member.signature ? String(member.signature) : "",
          kind: member.kind ? String(member.kind) : "function",
          errors: Array.isArray(member.errors) ? member.errors.map(String) : [],
        }))
      : [],
  })),
};

const target = path.join(__dirname, "..", "resources", "standard-library.json");
fs.writeFileSync(target, `${JSON.stringify(normalized, null, 2)}\n`);
process.stdout.write(`已更新 ${target}（${normalized.modules.length} 个模块）\n`);
