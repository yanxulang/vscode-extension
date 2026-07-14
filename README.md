# 言序语言 · VS Code

言序编程语言的官方 VS Code 扩展。

当前扩展版本为`1.1.0`，支持言序核心`1.1.0`及兼容的 1.x 版本，并包含全部 21 个稳定标准模块的补全和导入片段；`Base64`、`正则`、`URL`、`日期`另有可直接展开的示例片段。

## 功能

- `.yx` 文卷语法高亮；
- 中文引号、括号自动配对与代码折叠；
- 块结构、分支、错误处理、协议和文档注释的智能缩进；
- 变量、流程、函数、类、协议、泛型、异步任务、模块、元组和切片代码片段；
- 编辑器右上角一键运行当前文卷；
- 1.0 LSP 实时诊断、补全、跳转、引用、重命名、悬停、文档符号与全文格式化；
- LSP 不可用时仍提供基础补全、悬停说明和内建函数签名提示；
- VS Code“运行和调试”中的源码断点、继续、单步、调用栈与作用域变量；
- 静态检查、字节码 VM、执行踪迹与工作区测试命令；
- 一键调用 `yanxu 迁 --写` 更新当前文卷中的弃用语法；
- 在可复用 REPL 中运行选区或当前行；
- 状态栏显示语言服务状态，并可一键重启或查看通信日志；
- 自动发现“运行、检查、VM、踪迹、测试、迁移”六类 VS Code 任务；
- 一键调用`yanxu 迁 --写`迁移当前文卷中的已弃用形式；
- 命令面板打开言序 REPL 或在线文档。

## 使用

请先[安装言序命令行](https://yanxu.dev/download/)，然后打开任意 `.yx` 文件。默认会从 `PATH` 查找 `yanxu`；若安装在其他位置，请设置 `yanxu.executablePath`。

打开命令面板并输入“言序”即可查看所有命令。编辑器右键菜单可以运行当前文卷或把选中代码送入 REPL；“终端 → 运行任务”中可以直接选择言序任务。打开`.yx`后可在行号左侧设置断点，再从“运行和调试”选择“调试当前言序文卷”。

## 设置

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| `yanxu.executablePath` | `yanxu` | 指定言序命令行程序路径 |
| `yanxu.saveBeforeRun` | `true` | 执行、检查或跟踪前保存文卷 |
| `yanxu.languageServer.enabled` | `true` | 自动启动实时诊断和格式化服务 |
| `yanxuLanguageServer.trace.server` | `off` | 控制 LSP 通信日志详细程度 |

## 自动发布

每次提交或 Pull Request 都会运行结构校验、单元测试和 VSIX 打包。更新`package.json`与`package-lock.json`版本、加入同版本变更记录并推送到`main`后，`Auto Release`会自动创建`v*`标签，再由可复用`Release`工作流创建 GitHub Release 并上传 VSIX；仓库设置了`VSCE_PAT` Secret 时，还会同步发布到 VS Code Marketplace。已有标签也可从 Actions 手工重跑发布。

## 问题反馈

请在[扩展仓库](https://github.com/YanXuLang/vscode-extension/issues)报告问题。语言问题请提交到[语言核心仓库](https://github.com/YanXuLang/yanxu/issues)。

完整文档位于 [Fumadocs 文档站](https://docs.yanxu.dev/)。
