# Functional Testcase Writer Skill

一个面向 Agent 的功能测试用例文档编写 Skill。它按照 LegalLensTest / AragonTeamTest
仓库的风格，从**用户视角**生成中文功能测试用例 Markdown。

- **只写功能测试**：每条用例只描述用户可见操作与用户可见反馈。
- **安全 / 性能只留表头**：默认不展开，便于后续专项补充。
- **不写接口测试**：避免把实现细节混入功能用例。
- **不编造实际结果**：未执行即留空或 `待执行`。

## 解决的问题

- 功能用例风格、字段、编号不统一。
- 用例混入接口 / 数据库 / 后端等实现细节，失去用户视角。
- 编号跨文件重复或断号，`INDEX.md` 统计与实际不一致。
- 安全 / 性能章节缺位，后续无处补充。

## 三种事实分离

| 资产 | 回答的问题 |
|:---|:---|
| `FEAT-*.md` | 该功能点有哪些用户可见的功能用例 |
| `INDEX.md` | 模块下功能点与 TC 数量总览 |
| `问题跟踪` / `测试记录` | 执行结果与缺陷线索 |

## 目录

```text
.
├── SKILL.md
├── references/              # 编写规则（风格 / 编号 / 覆盖 / INDEX / 衔接）
├── templates/               # 功能用例、INDEX、INDEX 行模板
├── schemas/                 # 头部元信息字段定义（lint 的校验依据）
├── scripts/                 # 文档 lint 工具
├── examples/                # 完整示例：功能用例文件 + INDEX
└── LICENSE
```

## 安装到 Agent Skills

将本仓库目录放入 Agent 能扫描 Skill 的位置，例如：

```text
.opencode/skills/functional-testcase-writer/
~/.config/opencode/skills/functional-testcase-writer/
~/.agents/skills/functional-testcase-writer/
```

> 注意：Skill 的目录名必须与 `SKILL.md` 中的 `name`（`functional-testcase-writer`）
> 一致。直接 clone 本仓库时目录名为 `functional-testcase-writer-skill`，请重命名后再安装：

```bash
git clone https://github.com/eudjdh/functional-testcase-writer-skill.git \
  .opencode/skills/functional-testcase-writer
```

安装或更新后需要重启 Agent 客户端，使配置期加载的 Skill 生效。

## 使用说明

1. 参照 `references/style-rules.md` 了解文档与字段风格。
2. 参照 `references/numbering-rules.md` 了解 `FEAT` / `TC` 编号规则。
3. 复制 `templates/functional-testcase-template.md` 到目标模块目录，命名为
   `FEAT-[模块缩写]-[序号]-[功能点名称].md`。
4. 只填写 `一、功能测试`；`二、安全测试`、`三、性能测试` 保留表头。
5. 若目标仓库有 `INDEX.md`，同步更新计数与链接。

## 校验

对目标测试仓库运行文档 lint：

```bash
node scripts/lint-functional-testcases.mjs path/to/testcase-repo
```

检查项：

- 头部元信息是否缺少必填字段；`功能点编号`（`FEAT-...`）与 `文档版本号`
  （`V1` / `V1.0` / `V1.0.1` 等）格式是否正确（依据 `schemas/testcase-metadata.schema.json`）。
- 是否误建 `接口测试` 章节。
- 功能用例是否缺少必填字段、`用例类型` / `优先级` 是否合法、`用例编号`
  是否符合 `TC-[模块缩写]-[NNN]` 格式。
- `状态=待执行` 时 `实际结果` 是否被填充。
- 安全 / 性能章节是否被误编号。
- 功能用例编号是否重复（含跨文件重复）以及同一模块内是否连续、是否从 `001` 起始
  （缺号 / 未从 001 起始给出警告）。
- 功能用例是否出现禁用词（如 `返回码` / `数据库` / `后端` / `服务端` / `日志` / `HTTP` 等
  实现细节词；裸词 `接口` / `API` 因存在合理例外，不纳入自动校验）。
- 是否缺少 `测试记录` / `问题跟踪` 章节。
- 扫描目录存在 `INDEX.md` 时：TC 计数与链接文件是否一致、链接文件是否存在、
  模块小计与底部总计是否与明细之和一致，以及汇总表模块行与各模块小计是否一一对应且一致。

> 说明：lint 为**保守校验**，只覆盖最易出错的规则，不等同于完整规则集；
> `style-rules.md` 的全量禁用词未全部纳入自动校验。
> 元信息校验由 `schemas/testcase-metadata.schema.json` 驱动，两者保持同源。
> 编号重复 / 连续性仅统计「功能测试」章节用例表中的 `用例编号`，不把
> `问题跟踪` 等处的引用计入。
> 模板中的占位符（含 `[]` / `{}`）会被跳过格式校验，可在安装后直接对模板运行。

示例：

```bash
node scripts/lint-functional-testcases.mjs examples
```

## 示例

`examples/` 提供一份完整样例，可作为 agent 输出风格的参照：

```text
examples/
├── INDEX.md
└── 01-AUTH-认证与会话管理/
    └── FEAT-AUTH-001-用户登录.md
```

## 与 playwright-ui-mapper 组合

```text
探索页面 ──▶ 功能测试用例文档 ──▶ 可自动化 TC ──▶ Playwright 测试 ──▶ 回填结果
playwright-ui-mapper        functional-testcase-writer        playwright-ui-mapper
```

详见 [`references/ui-mapper-handoff.md`](references/ui-mapper-handoff.md)。

## License

MIT，详见 [`LICENSE`](LICENSE)。
