const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  dependencyPath,
  packageEntry,
  packageExport,
  parseLock,
  parseLockDocument,
  resolvePackageImport,
  shortHash,
} = require("../package-resolver");

test("解析中英文包清单字段与锁文件", () => {
  const manifest = `[包]\n名 = "应用"\n入口 = "src/主.yx"\n\n[依赖]\n共享工具 = { 路径 = "../共享工具", 版 = "^1" }\n`;
  assert.equal(packageEntry(manifest), "src/主.yx");
  assert.equal(dependencyPath(manifest, "共享工具"), "../共享工具");
  assert.equal(dependencyPath(`[package]\nentry='main.yx'\n[dependencies]\ntool='../tool'\n`, "tool"), "../tool");
  assert.equal(dependencyPath(`[依赖]\n工具 = {\n路径 = '../工具',\n版 = '^1'\n}\n`, "工具"), "../工具");
  assert.deepEqual(parseLock(`lock_version = 1
[[package]]
name = "共享工具"
version = "1.0.0"
source = "path:../共享工具"
checksum = "abc"
entry = "主.yx"
`)[0], {
    dependencies: {},
    exports: {},
    name: "共享工具",
    version: "1.0.0",
    source: "path:../共享工具",
    checksum: "abc",
    entry: "主.yx",
  });
  const formatTwo = parseLockDocument(`lock_version = 2
[root_dependencies]
HTTP = "yanxu-http@1.2.0#abc"
[[package]]
id = "yanxu-http@1.2.0#abc"
name = "yanxu-http"
version = "1.2.0"
source = "path:../http"
checksum = "abc"
entry = "src/默认.yx"
[package.dependencies]
内核 = "core@1.0.0#def"
[package.exports]
默认 = "src/默认.yx"
请求 = "src/请求.yx"
`);
  assert.equal(formatTwo.rootDependencies.HTTP, "yanxu-http@1.2.0#abc");
  assert.equal(formatTwo.packages[0].id, "yanxu-http@1.2.0#abc");
  assert.equal(formatTwo.packages[0].exports.请求, "src/请求.yx");
  assert.equal(formatTwo.packages[0].dependencies.内核, "core@1.0.0#def");
  assert.equal(packageExport(`[导出]\n默认='src/主.yx'\n请求='src/请求.yx'\n`, "请求"), "src/请求.yx");
  assert.equal(shortHash("https://packages.yanxu.dev/v1").length, 24);
});

test("格式 2 按根别名和显式导出定位依赖并隔离传递包", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yanxu-vscode-format2-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const dependency = path.join(root, "http");
  await fs.mkdir(path.join(app, "src"), { recursive: true });
  await fs.mkdir(path.join(dependency, "src"), { recursive: true });
  await fs.writeFile(path.join(app, "言序.toml"), `[包]\n格式=2\n名称='app'\n版本='1.0.0'\n入口='src/主.yx'\n[依赖]\nHTTP={包='yanxu-http',路径='../http'}\n`);
  await fs.writeFile(path.join(app, "言序.lock"), `lock_version=2
[root_dependencies]
HTTP='yanxu-http@1.0.0#abc'
[[package]]
id='yanxu-http@1.0.0#abc'
name='yanxu-http'
version='1.0.0'
source='path:../http'
checksum='abc'
entry='src/主.yx'
[package.dependencies]
内核='core@1.0.0#def'
[package.exports]
默认='src/主.yx'
请求='src/请求.yx'
[[package]]
id='core@1.0.0#def'
name='内核'
version='1.0.0'
source='path:../core'
checksum='def'
entry='src/主.yx'
`);
  await fs.writeFile(path.join(app, "src", "主.yx"), "引「包:HTTP/请求」为 请求；\n");
  await fs.writeFile(path.join(dependency, "言序.toml"), `[包]\n格式=2\n名称='yanxu-http'\n版本='1.0.0'\n入口='src/主.yx'\n[导出]\n默认='src/主.yx'\n请求='src/请求.yx'\n`);
  await fs.writeFile(path.join(dependency, "src", "主.yx"), "公 定 名='默认'；\n");
  await fs.writeFile(path.join(dependency, "src", "请求.yx"), "公 定 名='请求'；\n");

  assert.equal(
    await resolvePackageImport(path.join(app, "src", "主.yx"), "包:HTTP/请求"),
    path.join(dependency, "src", "请求.yx"),
  );
  assert.equal(await resolvePackageImport(path.join(app, "src", "主.yx"), "包:内核"), undefined);
  assert.equal(await resolvePackageImport(path.join(app, "src", "主.yx"), "包:HTTP/内部"), undefined);
});

test("只读解析包导入并定位路径依赖入口", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yanxu-vscode-index-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const app = path.join(root, "应用");
  const dependency = path.join(root, "共享工具");
  await fs.mkdir(path.join(app, "src"), { recursive: true });
  await fs.mkdir(dependency, { recursive: true });
  await fs.writeFile(path.join(app, "言序.toml"), `[包]\n名='应用'\n版='1.0.0'\n入口='src/主.yx'\n[依赖]\n共享工具={路径='../共享工具'}\n`);
  await fs.writeFile(path.join(app, "言序.lock"), `lock_version=1\n[[package]]\nname='共享工具'\nversion='1.0.0'\nsource='path:../共享工具'\nchecksum='abc'\nentry='主.yx'\n`);
  await fs.writeFile(path.join(app, "src", "主.yx"), "引「包:共享工具」为 工具；\n");
  await fs.writeFile(path.join(dependency, "言序.toml"), `[包]\n名='共享工具'\n版='1.0.0'\n入口='主.yx'\n`);
  await fs.writeFile(path.join(dependency, "主.yx"), "公 法 规范标题（标题：文）：文 则\n终\n");

  assert.equal(
    await resolvePackageImport(path.join(app, "src", "主.yx"), "包:共享工具"),
    path.join(dependency, "主.yx"),
  );
});
