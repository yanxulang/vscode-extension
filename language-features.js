const KEYWORDS = [
  ["令", "声明可改写变量"], ["定", "声明不可改写绑定"], ["置", "改写已有变量或字段"],
  ["为", "连接名称与初始值"], ["言", "输出表达式的值"], ["若", "开始条件分支"],
  ["则", "开始语句块"], ["否则", "开始备用条件分支"], ["终", "结束当前语句块"],
  ["当", "开始条件循环"], ["逐", "遍历容器或遍器"], ["于", "指定迭代来源"],
  ["异", "声明返回任务的异步函数"], ["候", "等待任务并取得结果"],
  ["法", "声明函数或方法"], ["归", "从函数返回值"], ["类", "声明类"],
  ["承", "指定父类"], ["协", "声明结构协议"], ["纳", "声明类纳入协议"],
  ["域", "声明类字段"], ["公", "声明公开成员"], ["私", "声明私有成员"],
  ["只", "声明只读字段"], ["静", "声明静态成员"], ["引", "导入文件或标准模块"],
  ["试", "开始错误捕获块"], ["救", "处理结构化错误"], ["抛", "抛出错误"],
  ["且", "逻辑与运算"], ["或", "逻辑或运算"], ["非", "逻辑非运算"]
].map(([label, documentation]) => ({ label, kind: "keyword", detail: "言序关键字", documentation }));

const TYPES = [
  ["数", "数字类型"], ["文", "文字类型"], ["理", "逻辑类型"], ["空", "空值类型"],
  ["列", "可变有序容器"], ["元", "不可变有序容器"], ["典", "键值映射容器"],
  ["遍器", "惰性迭代器"], ["任务", "异步任务及其结果类型"], ["法", "函数类型"], ["类", "类类型"], ["协", "结构协议类型"],
  ["对象", "对象类型"], ["模块", "模块类型"], ["误", "结构化错误类型"], ["任意", "任意值类型"]
].map(([label, documentation]) => ({ label, kind: "type", detail: "言序类型", documentation }));

const CONSTANTS = [
  { label: "真", kind: "constant", detail: "理", documentation: "逻辑真值。" },
  { label: "假", kind: "constant", detail: "理", documentation: "逻辑假值。" },
  { label: "空", kind: "constant", detail: "空", documentation: "表示没有值。" },
  { label: "此", kind: "constant", detail: "当前实例", documentation: "引用当前类实例。" }
];

const BUILTINS = [
  ["时刻", "时刻（）：数", [], "取得当前时间。"],
  ["长度", "长度（值：任意）：数", ["值"], "取得文字或容器的元素数量。"],
  ["类型", "类型（值：任意）：文", ["值"], "取得值的运行时类型名称。"],
  ["追加", "追加（容器：列<任意>，值：任意）：列<任意>", ["容器", "值"], "向列尾追加一个值。"],
  ["弹出", "弹出（容器：列<任意>）：任意", ["容器"], "移除并返回列尾元素。"],
  ["有键", "有键（容器：典<任意，任意>，键：任意）：理", ["容器", "键"], "判断典中是否存在指定键。"],
  ["插入", "插入（容器：列<任意>，位置：数，值：任意）：列<任意>", ["容器", "位置", "值"], "在列的指定位置插入值。"],
  ["删除", "删除（容器：列<任意>，位置：数）：任意", ["容器", "位置"], "删除并返回列中指定位置的值。"],
  ["键列", "键列（容器：典<任意，任意>）：列<任意>", ["容器"], "返回典的全部键。"],
  ["值列", "值列（容器：典<任意，任意>）：列<任意>", ["容器"], "返回典的全部值。"],
  ["遍", "遍（值：任意）：遍器", ["值"], "把可迭代值转换为遍器。"],
  ["续", "续（遍器：遍器）：元<理，任意>", ["遍器"], "取得遍器的下一个值。"],
  ["范围", "范围（起：数，止：数）：遍器", ["起", "止"], "创建半开数字范围。"],
  ["步进范围", "步进范围（起：数，止：数，步：数）：遍器", ["起", "止", "步"], "创建带步长的半开数字范围。"],
  ["映射", "映射（来源：任意，变换：法）：遍器", ["来源", "变换"], "惰性转换可迭代值。"],
  ["筛选", "筛选（来源：任意，条件：法）：遍器", ["来源", "条件"], "惰性保留满足条件的值。"],
  ["折叠", "折叠（来源：任意，初值：任意，合并：法）：任意", ["来源", "初值", "合并"], "把序列聚合成一个值。"],
  ["排序", "排序（来源：任意）：列<任意>", ["来源"], "返回排序后的新列。"],
  ["反转", "反转（来源：任意）：列<任意>", ["来源"], "返回逆序的新列。"],
  ["包含", "包含（来源：任意，值：任意）：理", ["来源", "值"], "判断来源是否包含指定值。"],
  ["寻找", "寻找（来源：任意，条件：法）：元<理，任意>", ["来源", "条件"], "寻找首个满足条件的值。"],
  ["取消", "取消（任务：任务<任意>）：理", ["任务"], "取消尚未开始的任务。"],
  ["任务状态", "任务状态（任务：任务<任意>）：文", ["任务"], "取得待行、运行、完成、失败或取消状态。"],
  ["并候", "并候（任务列：列<任务<任意>>）：列<任意>", ["任务列"], "结构化等待任务列；失败时取消余下任务。"]
].map(([label, signature, parameters, documentation]) => ({
  label,
  kind: "function",
  detail: signature,
  signature,
  parameters,
  documentation,
  insertText: parameters.length === 0
    ? `${label}（）`
    : `${label}（${parameters.map((parameter, index) => `\${${index + 1}:${parameter}}`).join("，")}）`
}));

const STANDARD_MODULES = [
  "文字", "数学", "时间", "文件", "JSON", "网络", "测试", "路径", "环境", "哈希", "编码", "统计", "CSV",
  "随机", "标识", "模板", "校验", "Base64", "正则", "URL", "日期"
].map((label) => ({
  label,
  kind: "module",
  detail: `标准:${label}`,
  documentation: `言序标准库“${label}”模块。`
}));

const SYMBOLS = [...KEYWORDS, ...TYPES, ...CONSTANTS, ...BUILTINS];
const SYMBOL_BY_LABEL = new Map(SYMBOLS.map((entry) => [entry.label, entry]));
const BUILTIN_BY_LABEL = new Map(BUILTINS.map((entry) => [entry.label, entry]));

function completionEntries(linePrefix) {
  if (/标准\s*[:：][^」”"]*$/.test(linePrefix)) return STANDARD_MODULES;
  if (/[：:|<]\s*[^\s：:|<，,]*$/.test(linePrefix)) return TYPES;
  return SYMBOLS;
}

function lookupLanguageSymbol(label) {
  return SYMBOL_BY_LABEL.get(label);
}

function signatureAt(sourcePrefix) {
  let depth = 0;
  let opening = -1;
  for (let index = sourcePrefix.length - 1; index >= 0; index -= 1) {
    const character = sourcePrefix[index];
    if (character === "）" || character === ")") depth += 1;
    else if (character === "（" || character === "(") {
      if (depth === 0) {
        opening = index;
        break;
      }
      depth -= 1;
    }
  }
  if (opening < 0) return undefined;

  const before = sourcePrefix.slice(0, opening);
  const name = before.match(/([^\s（）()【】\[\]{}，,:：.；;"“”「」]+)\s*$/)?.[1];
  const builtin = BUILTIN_BY_LABEL.get(name);
  if (!builtin) return undefined;

  let activeParameter = 0;
  depth = 0;
  for (const character of sourcePrefix.slice(opening + 1)) {
    if ("（(【[{".includes(character)) depth += 1;
    else if ("）)】]}".includes(character)) depth = Math.max(0, depth - 1);
    else if ((character === "，" || character === ",") && depth === 0) activeParameter += 1;
  }
  return { ...builtin, activeParameter: Math.min(activeParameter, Math.max(0, builtin.parameters.length - 1)) };
}

module.exports = {
  BUILTINS,
  CONSTANTS,
  KEYWORDS,
  STANDARD_MODULES,
  TYPES,
  completionEntries,
  lookupLanguageSymbol,
  signatureAt
};
