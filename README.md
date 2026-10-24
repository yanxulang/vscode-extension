# 言序语言 · VS Code

言序编程语言的官方 VS Code 扩展。

当前扩展版本为 `1.5.0`。编辑能力跟随本机 `yanxu` 语言服务；离线标准库快照仍是言序 1.1.7 的 25 个模块，命令可用时会改用当前 CLI 的 `yanxu 标准库 --json`。

## 功能

- `.yx` 语法高亮、括号配对、折叠、缩进和代码片段；
- 语言服务提供实时诊断、补全、跳转、引用、重命名、悬停、大纲和格式化。签名提示、工作区符号和导入链接由扩展索引提供；语言服务不可用时，索引用作补全和跳转的回退；
- 中文、全拼和拼音首字母筛选补全与工作区符号；
- 点击 `引「…」` 打开本地模块，标准库模块在只读虚拟文卷中查看；
- 文卷首行的运行、调试、检查代码透镜；规格文卷另有“运行测试”；
- 编辑器运行菜单：运行文卷、调试、按清单运行包、VM、REPL 选区和当前规格；
- 调试适配器支持断点、入口暂停、继续、单步、调用栈、作用域和悬停求值；
- 测试面板中的“言序规格”调用 `yanxu 试 --json`；
- 检查、运行和迁移任务把编译诊断与弃用警告送进问题面板；弃用诊断可一键迁移；
- 包清单、包锁、YXB 编译、桌面 Bundle、解释器与 VM 对照、API 文档；
- 状态栏显示语言服务和 `yanxu 版本`，可选择本机言序程序；
- 新建文卷模板、REPL 终端配置和开始使用引导。

## 使用

请先[安装言序命令行](https://yanxu.dev/download/)，然后打开任意 `.yx` 文卷或包含 `言序.toml` 的项目。扩展直接调用 `yanxu`。默认从 `PATH` 查找；若安装在其他位置，运行“言序：选择言序程序”或设置 `yanxu.executablePath`。

打开 `.yx` 后，编辑器标题栏的运行按钮可以执行当前文卷。有包清单时用“按清单运行包”，这样会遵守清单里的权限。F5 启动调试。规格文卷放在 `spec/`，期望输出写成 `// 期：`。未受信任的工作区可以编辑和查看诊断；运行、调试、测试和迁移会先请求信任。

快捷键：运行文卷是 Ctrl+Alt+R（macOS 为 Cmd+Alt+R），检查是 Ctrl+Alt+C，把选区送入 REPL 是 Ctrl+Alt+Enter。

## 设置

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| `yanxu.executablePath` | `yanxu` | 言序命令行程序路径 |
| `yanxu.saveBeforeRun` | `true` | 执行、检查、调试或迁移前保存文卷 |
| `yanxu.run.programArgs` | `[]` | 放在 `--` 之后传给程序的参数 |
| `yanxu.codeLens.enabled` | `true` | 文卷首行的运行、调试和检查 |
| `yanxu.testing.specPattern` | `**/spec/**/*.yx` | 规格测试的扫描范围 |
| `yanxu.testing.timeout` | `10000` | 单个规格文卷的超时毫秒 |
| `yanxu.testing.jobs` | `0` | 目录测试并发；0 为 CLI 默认 |
| `yanxu.languageServer.enabled` | `true` | 启动语言服务 |
| `yanxu.index.enabled` | `true` | 建立工作区、导入模块和标准库符号索引 |
| `yanxu.index.maxFiles` | `5000` | 一次索引最多扫描的文卷数 |
| `yanxu.index.includeExternalModules` | `true` | 索引工作区外的本地与包导入模块 |
| `yanxu.completion.pinyin` | `true` | 用全拼或拼音首字母筛选补全 |
| `yanxuLanguageServer.trace.server` | `off` | 语言服务通信日志 |

索引会随文卷创建、修改、保存和删除更新。依赖大改之后，可以运行“言序：重建符号索引”。

## 自动发布

每次提交或 Pull Request 都会运行结构校验、单元测试和 VSIX 打包。更新`package.json`与`package-lock.json`版本、加入同版本变更记录并推送到`main`后，`Auto Release`会自动创建`v*`标签，再由可复用`Release`工作流创建 GitHub Release 并上传 VSIX；仓库设置了`VSCE_PAT` Secret 时，还会同步发布到 VS Code Marketplace。已有标签也可从 Actions 手工重跑发布。

## 问题反馈

请在[扩展仓库](https://github.com/YanXuLang/vscode-extension/issues)报告问题。语言问题请提交到[语言核心仓库](https://github.com/YanXuLang/yanxu/issues)。

完整文档位于 [Fumadocs 文档站](https://docs.yanxu.dev/)。
