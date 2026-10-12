---
name: functional-testcase-writer
description: Use when asked to write 功能测试用例 or 测试用例文档 in LegalLens or AragonTeam style, or when a task mentions FEAT/TC 编号, 用户视角测试步骤, or 测试大纲 INDEX. Generates Chinese functional test-case Markdown from the user's perspective. Do NOT expand API, security, or performance tests unless explicitly requested — security and performance sections are kept as empty headers only.
license: MIT
metadata:
  version: "0.1.0"
  domain: quality
  output-format: markdown
---

# 功能测试用例编写（Functional Testcase Writer）

从**用户视角**编写功能测试用例文档，风格对齐 LegalLensTest / AragonTeamTest 仓库。
安全测试与性能测试只保留表头，不主动展开；不生成接口测试章节。

## 适用场景

- 为已有前端平台或某个功能点编写功能测试用例。
- 生成 `FEAT-[模块缩写]-[序号]-[功能点名称].md`。
- 维护测试大纲 `INDEX.md` 的用例计数与链接。

## 不适用

- 接口 / API 测试编写（除非用户明确要求）。
- 安全测试、性能测试的完整编写（本 skill 仅保留空表头）。
- 生成可执行的 Playwright 测试（交给 `playwright-ui-mapper`）。

## Required Inputs

开始前收集：

- 目标仓库或输出目录。
- 模块名称与模块缩写。
- 功能点名称与功能点序号（缺失时按模块递增）。
- 关联需求 / 功能说明。
- 页面入口与用户角色。
- 前置条件与测试数据。
- 可参考的既有文档（`README.md`、`INDEX.md`、`模板/`、同模块已有文件）。

## Workflow

1. 读取目标仓库的 `README.md`、`INDEX.md`、`模板/` 与同模块已有文件，确认风格与编号。
2. 读取 `references/style-rules.md` 与 `references/numbering-rules.md`。
3. 确认模块缩写，扫描同模块现有最大 `TC-[模块缩写]-NNN`，从其后续编。
4. 读取 `references/functional-coverage-rules.md`，规划覆盖范围。
5. 仅展开 `一、功能测试` 的内容。
6. 保留 `二、安全测试`、`三、性能测试` 的空表头。
7. 写入 `测试记录` 与 `问题跟踪` 空表。
8. 若存在 `INDEX.md`，按 `references/index-maintenance.md` 更新计数与链接。
9. 若可访问本 skill 的脚本路径，运行 `node <skill目录>/scripts/lint-functional-testcases.mjs <输出目录>` 自检，修复全部 error 后再交付。
10. 输出完成摘要：文件路径、TC 数量、待确认项、是否更新 INDEX、lint 结果。

## 功能用例规则

- 一条用例只验证一个明确目标。
- 操作步骤只写用户动作：点击 / 输入 / 选择 / 上传 / 切换 / 滚动 / 刷新 / 查看 / 关闭。
- 预期结果只写用户可见反馈：提示文案、跳转、按钮状态、弹窗状态、列表变化、数据展示。
- 用例类型仅取 `正常流程` / `异常处理` / `边界情况`。
- 每条用例独立为一个「项目 / 内容」两列表，用例之间空一行。

## 禁止事项

- 禁止写接口路径、请求方式、返回码、数据库、后端、服务端、日志、代码函数。
- 禁止把页面观察当作产品预期；预期不明确时标注「待确认」或向用户询问。
- 禁止编造 `实际结果`；未执行时留空或写 `待执行`。
- 禁止生成 `接口测试` 章节，禁止主动展开安全 / 性能用例。

## 章节策略

| 章节 | 处理方式 |
|:---|:---|
| 一、功能测试 | 完整生成 |
| 二、安全测试 | 仅保留表头 |
| 三、性能测试 | 仅保留表头 |
| 接口测试 | 不生成 |

## 编号

- 功能点：`FEAT-[模块缩写]-[NNN]`
- 功能用例：`TC-[模块缩写]-[NNN]`，模块内全局连续。
- 安全 / 性能空表头**不编号、不计入统计**，除非用户明确要求补充。

## 完成标准

- 产出符合模板的 `.md`，功能测试完整且为纯用户视角。
- 安全 / 性能仅有表头；无接口章节。
- 编号连续无重复；`INDEX.md`（若存在）计数正确。
- 无编造的「实际结果」。

## 参考

- `references/style-rules.md`
- `references/numbering-rules.md`
- `references/functional-coverage-rules.md`
- `references/index-maintenance.md`
- `references/ui-mapper-handoff.md`
- `templates/functional-testcase-template.md`
- `examples/`（完整示例：功能用例文件 + INDEX）
- `scripts/lint-functional-testcases.mjs`（产出后自检）
