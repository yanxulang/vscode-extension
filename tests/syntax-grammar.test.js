const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const grammar = JSON.parse(
  fs.readFileSync(path.join(root, "syntaxes/yanxu.tmLanguage.json"), "utf8"),
);

grammar.name = "yanxu";
grammar.aliases = ["yx", "言序"];

const fixture = `引「标准:JSON」为 JSON；
公 类 示例 则
    公 域 名：文；

    法 读取（次数：数）：文 则
        # “若然”是普通标识符，不是关键字。
        定 若然：理 为 真；
        若 次数 不小于 1 且 若然 则
            归 JSON.序列化（{「名」：此.名}）；
        终
        试
            抛「失败」；
        救 错误 则
            归「空」；
        终
    终
终

定 值：文|空 为 示例（）；
言 值；`;

function explainedScopes(tokens) {
  const scopes = new Map();
  for (const line of tokens) {
    for (const token of line) {
      for (const explanation of token.explanation ?? []) {
        const names = explanation.scopes.map((scope) => scope.scopeName);
        const previous = scopes.get(explanation.content) ?? [];
        scopes.set(explanation.content, [...previous, ...names]);
      }
    }
  }
  return scopes;
}

test("言序语法覆盖真实词法类别和围栏别名", async () => {
  const { createHighlighter } = await import("shiki");
  const highlighter = await createHighlighter({
    themes: ["github-light"],
    langs: [grammar],
  });

  try {
    for (const language of ["yanxu", "yx", "言序"]) {
      const result = highlighter.codeToTokens(fixture, {
        lang: language,
        theme: "github-light",
        includeExplanation: true,
      });
      const scopes = explainedScopes(result.tokens);

      assert.ok(scopes.get("引")?.includes("keyword.control.import.yanxu"));
      assert.ok(scopes.get("类")?.includes("storage.type.class.yanxu"));
      assert.ok(scopes.get("读取")?.includes("entity.name.function.yanxu"));
      assert.ok(scopes.get("序列化")?.includes("entity.name.function.call.yanxu"));
      assert.ok(scopes.get("文")?.includes("support.type.yanxu"));
      assert.ok(scopes.get("真")?.includes("constant.language.yanxu"));
      assert.ok(scopes.get("1")?.includes("constant.numeric.yanxu"));
      assert.ok(scopes.get("不小于")?.includes("keyword.operator.yanxu"));
      assert.ok(scopes.get("失败")?.includes("string.quoted.double.corner.yanxu"));
      assert.ok(scopes.get("；")?.includes("punctuation.yanxu"));

      const plainIdentifierScopes = scopes.get("若然") ?? [];
      assert.deepEqual(
        [...new Set(plainIdentifierScopes)],
        ["source.yanxu", "variable.other.readwrite.yanxu"],
      );
    }
  } finally {
    highlighter.dispose();
  }
});
