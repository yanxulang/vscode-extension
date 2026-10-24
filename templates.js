const TEMPLATES = Object.freeze([
  Object.freeze({
    id: "script",
    label: "可运行脚本",
    description: "输出一行文字，可以直接运行",
    filename: "主.yx",
    body: "言「你好，言序」；\n"
  }),
  Object.freeze({
    id: "test",
    label: "规格测试",
    description: "用 // 期： 声明期望输出",
    filename: "示例.yx",
    body: "// 期：你好，言序\n言「你好，言序」；\n"
  }),
  Object.freeze({
    id: "function",
    label: "公开函数",
    description: "带文档注释的模块入口",
    filename: "模块.yx",
    body: "/// 对外提供的计算。\n公 法 计算（值：数）：数 则\n    归 值；\n终\n"
  }),
  Object.freeze({
    id: "gui",
    label: "言窗应用",
    description: "窗口、布局和关闭回调",
    filename: "主.yx",
    body: [
      "引「包:言窗」为 界面；",
      "",
      "定 应用 为 界面.应用（「言序应用」）；",
      "定 窗口 为 应用.窗口（{「标题」：「言序应用」，「宽」：800，「高」：600}）；",
      "定 布局 为 窗口.纵向布局（{「间距」：12，「内边距」：16}）；",
      "布局.文字（「你好，言序」）；",
      "",
      "法 关闭处理（事件）则 应用.退出（）；终",
      "窗口.关闭时（关闭处理）；",
      "窗口.显示（）；",
      "应用.运行（）；",
      ""
    ].join("\n")
  }),
  Object.freeze({
    id: "blank",
    label: "空白文卷",
    description: "只创建 .yx 文卷",
    filename: "未名.yx",
    body: ""
  })
]);

function templateById(id) {
  return TEMPLATES.find((template) => template.id === id);
}

module.exports = { TEMPLATES, templateById };
