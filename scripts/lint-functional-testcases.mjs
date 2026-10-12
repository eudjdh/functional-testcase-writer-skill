#!/usr/bin/env node
// 保守校验：覆盖最易出错的规则，不等同于完整规则集。
// 已覆盖：接口测试章节、元信息必填与格式（schema 驱动）、功能用例必填字段与 TC 编号格式、
//         待执行/实际结果矛盾、禁用词、编号重复与跨文件连续性、安全/性能误编号、
//         测试记录/问题跟踪存在性、INDEX.md 计数/链接/小计/总计及跨表一致性。
// 未覆盖：style-rules 的全量禁用词（仅覆盖内置高频禁用词）。
import { readFile, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_FILES = new Set(["README.md", "INDEX.md", "SKILL.md", "通用测试基线.md"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "模板",
  "templates",
  "references",
  "schemas",
  "scripts",
]);

const SECTION = {
  functional: "功能测试",
  security: "安全测试",
  performance: "性能测试",
  interface: "接口测试",
  record: "测试记录",
  issues: "问题跟踪",
};

const CASE_TYPES = new Set(["正常流程", "异常处理", "边界情况"]);
const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const FALLBACK_REQUIRED_METADATA = [
  "功能点编号",
  "功能点名称",
  "所属模块",
  "关联需求",
  "测试范围概要",
  "文档版本号",
  "测试环境说明",
];
const FALLBACK_FEAT_PATTERN = "^FEAT-[A-Z][A-Z0-9]*-[0-9]{3,}$";
const FALLBACK_VERSION_PATTERN = "^V[0-9]+(\\.[0-9]+)*$";
const REQUIRED_FIELDS = [
  "用例编号",
  "用例名称",
  "用例类型",
  "输入条件",
  "操作步骤",
  "预期结果",
  "优先级",
  "状态",
];
const FORBIDDEN_WORDS = [
  "接口返回",
  "返回 200",
  "返回200",
  "返回码",
  "数据库",
  "后端",
  "服务端",
  "日志",
  "SQL",
  "JSON",
  "HTTP",
  "调用接口",
  "请求参数",
  "响应体",
];

// schema 作为元信息校验的单一事实来源；缺失时回退到内置默认值。
const SCHEMA = loadMetadataSchema();
const REQUIRED_METADATA = SCHEMA?.required ?? FALLBACK_REQUIRED_METADATA;
const FEAT_PATTERN = new RegExp(
  SCHEMA?.properties?.["功能点编号"]?.pattern ?? FALLBACK_FEAT_PATTERN,
);
const VERSION_PATTERN = new RegExp(
  SCHEMA?.properties?.["文档版本号"]?.pattern ?? FALLBACK_VERSION_PATTERN,
);
const TC_ID_PATTERN = /^TC-[A-Z][A-Z0-9]*-[0-9]{3,}$/;

function loadMetadataSchema() {
  try {
    const schemaUrl = new URL("../schemas/testcase-metadata.schema.json", import.meta.url);
    return JSON.parse(readFileSync(schemaUrl, "utf8"));
  } catch {
    return null;
  }
}

export function lintContent(text, fileLabel = "<memory>") {
  const issues = [];
  const error = (message) => issues.push({ level: "error", message });
  const warn = (message) => issues.push({ level: "warn", message });

  const metadata = parseMetadata(text);
  const isPlaceholder = (value) => /[[\]{}]/.test(value);
  for (const key of REQUIRED_METADATA) {
    if (!metadata[key]) error(`${fileLabel}: 头部元信息缺少必填字段「${key}」`);
  }
  const featId = metadata["功能点编号"];
  if (featId && !isPlaceholder(featId) && !FEAT_PATTERN.test(featId)) {
    error(`${fileLabel}: 功能点编号格式不正确：${featId}`);
  }
  const version = metadata["文档版本号"];
  if (version && !isPlaceholder(version) && !VERSION_PATTERN.test(version)) {
    error(`${fileLabel}: 文档版本号格式不正确：${version}（应形如 V1.0）`);
  }

  const sections = splitSections(text);
  const find = (keyword) =>
    [...sections.entries()].find(([title]) => title.includes(keyword));

  const interfaceSection = find(SECTION.interface);
  if (interfaceSection) {
    error(`${fileLabel}: 不应存在「${interfaceSection[0]}」章节`);
  }

  const functional = (find(SECTION.functional)?.[1]) ?? "";
  const functionalCases = caseTables(functional);
  if (functionalCases.length === 0) {
    warn(`${fileLabel}: 「${SECTION.functional}」未发现功能用例表`);
  }
  const seenTc = new Set();
  const functionalTcIds = [];
  for (const fields of functionalCases) {
    const id = fields["用例编号"] ?? "";
    if (!/^TC-/.test(id)) {
      if (id || Object.keys(fields).length > 1) {
        warn(`${fileLabel}: 「${SECTION.functional}」存在非 TC 用例表（用例编号：${id || "空"}）`);
      }
      continue;
    }
    if (!TC_ID_PATTERN.test(id)) {
      error(`${fileLabel}: 用例编号格式不正确：${id}（应形如 TC-AUTH-001）`);
    }
    functionalTcIds.push(id);
    for (const field of REQUIRED_FIELDS) {
      if (!fields[field] || !fields[field].trim()) {
        error(`${fileLabel}: ${id} 缺少必填字段「${field}」`);
      }
    }
    if (fields["用例类型"] && !CASE_TYPES.has(fields["用例类型"].trim())) {
      error(`${fileLabel}: ${id} 用例类型非法「${fields["用例类型"]}」（仅允许 正常流程/异常处理/边界情况）`);
    }
    if (fields["优先级"] && !PRIORITIES.has(fields["优先级"].trim())) {
      error(`${fileLabel}: ${id} 优先级非法「${fields["优先级"]}」（仅允许 P0/P1/P2/P3）`);
    }
    const status = (fields["状态"] ?? "").trim();
    const actual = (fields["实际结果"] ?? "").trim();
    if (status === "待执行" && actual) {
      error(`${fileLabel}: ${id} 状态为「待执行」但「实际结果」非空，疑似编造实际结果`);
    }
    for (const checkField of ["用例名称", "输入条件", "操作步骤", "预期结果"]) {
      const value = fields[checkField] ?? "";
      for (const word of FORBIDDEN_WORDS) {
        if (value.includes(word)) {
          error(`${fileLabel}: ${id} 的「${checkField}」出现禁用词「${word}」`);
        }
      }
    }
    if (seenTc.has(id)) {
      error(`${fileLabel}: 功能用例编号重复：${id}`);
    }
    seenTc.add(id);
  }

  for (const keyword of [SECTION.security, SECTION.performance]) {
    const entry = find(keyword);
    if (!entry) {
      warn(`${fileLabel}: 缺少章节「${keyword}」（应保留空表头）`);
      continue;
    }
    for (const fields of caseTables(entry[1])) {
      const id = (fields["用例编号"] ?? "").trim();
      if (id) {
        error(`${fileLabel}: 「${entry[0]}」不应包含编号用例（发现 ${id}），本 skill 仅保留空表头`);
      }
    }
  }

  for (const keyword of [SECTION.record, SECTION.issues]) {
    if (!find(keyword)) warn(`${fileLabel}: 缺少章节「${keyword}」`);
  }

  return { issues, tcIds: functionalTcIds };
}

async function checkIndex(indexPath) {
  const issues = [];
  const label = basename(indexPath);
  const base = dirname(indexPath);
  const text = await readFile(indexPath, "utf8");
  const lines = text.split("\n");

  for (const line of lines) {
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length < 6) continue;
    if (cells[0] === "#" || cells[0] === "模块") continue;
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.some((cell) => /小计|总计|合计|汇总/.test(cell))) continue;
    const tc = toNumber(cells[2]);
    if (!Number.isInteger(tc)) continue;
    const linkCell = cells.find((cell) => cell.includes("]("));
    if (!linkCell) {
      issues.push({ level: "error", message: `${label}: 行「${cells[1]}」缺少文件链接` });
      continue;
    }
    const link = decodeURIComponent(linkCell.match(/\]\(([^)]+)\)/)[1]);
    const target = resolve(base, link);
    if (!(await exists(target))) {
      issues.push({ level: "error", message: `${label}: 链接文件不存在 ${link}` });
      continue;
    }
    const fileText = await readFile(target, "utf8");
    const actual = new Set(functionalCaseIds(fileText)).size;
    if (actual !== tc) {
      issues.push({
        level: "error",
        message: `${label}: 「${cells[1]}」TC 计数 ${tc} 与文件实际 ${actual} 不一致`,
      });
    }
  }

  const tables = indexTables(lines);
  const moduleSubtotals = new Map();
  for (const { heading, header, rows } of tables) {
    const tcIndex = header.indexOf("TC");
    if (tcIndex < 0) continue;
    const dataRows = rows.filter((cells) => !cells.some((cell) => /小计|总计|合计|汇总/.test(cell)));
    const detailSum = dataRows.reduce((sum, cells) => sum + (toNumber(cells[tcIndex]) || 0), 0);
    for (const [pattern, kind] of [
      [/小计/, "小计"],
      [/总计|合计|汇总/, "总计"],
    ]) {
      const declaredRow = rows.find((cells) => cells.some((cell) => pattern.test(cell)));
      if (!declaredRow) continue;
      const declared = toNumber(declaredRow[tcIndex]);
      if (Number.isInteger(declared) && declared !== detailSum) {
        issues.push({
          level: "error",
          message: `${label}: ${kind} ${declared} 与明细之和 ${detailSum} 不一致`,
        });
      }
    }
    if (heading && header.includes("功能点")) {
      const subtotalRow = rows.find((cells) => cells.some((cell) => /小计/.test(cell)));
      if (subtotalRow) moduleSubtotals.set(heading, toNumber(subtotalRow[tcIndex]));
    }
  }

  const summaryModules = new Map();
  for (const { header, rows } of tables) {
    if (!header.includes("模块")) continue;
    const tcIndex = header.indexOf("TC");
    if (tcIndex < 0) continue;
    for (const cells of rows) {
      if (cells.some((cell) => /小计|总计|合计|汇总/.test(cell))) continue;
      const moduleName = cells[0];
      const declared = toNumber(cells[tcIndex]);
      if (!Number.isInteger(declared)) continue;
      summaryModules.set(moduleName, declared);
      if (!moduleSubtotals.has(moduleName)) {
        issues.push({
          level: "error",
          message: `${label}: 汇总表「${moduleName}」缺少对应模块小计`,
        });
        continue;
      }
      const subtotal = moduleSubtotals.get(moduleName);
      if (Number.isInteger(subtotal) && declared !== subtotal) {
        issues.push({
          level: "error",
          message: `${label}: 汇总表「${moduleName}」TC ${declared} 与模块小计 ${subtotal} 不一致`,
        });
      }
    }
  }
  for (const [moduleName, subtotal] of moduleSubtotals) {
    if (summaryModules.has(moduleName)) continue;
    issues.push({
      level: "error",
      message: `${label}: 模块「${moduleName}」小计 ${subtotal} 未出现在汇总表`,
    });
  }

  return issues;
}

function checkContinuity(globalTc) {
  const issues = [];
  const byPrefix = new Map();
  for (const id of globalTc.keys()) {
    const match = id.match(/^TC-([A-Z][A-Z0-9]*)-([0-9]{3,})$/);
    if (!match) continue;
    if (!byPrefix.has(match[1])) byPrefix.set(match[1], new Set());
    byPrefix.get(match[1]).add(Number.parseInt(match[2], 10));
  }
  for (const [prefix, numbers] of byPrefix) {
    const sorted = [...numbers].sort((a, b) => a - b);
    if (sorted.length && sorted[0] !== 1) {
      issues.push({
        level: "warn",
        message: `TC-${prefix}-*: 未从 001 起始，最小编号为 ${pad3(sorted[0])}`,
      });
    }
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] !== sorted[i - 1] + 1) {
        issues.push({
          level: "warn",
          message: `TC-${prefix}-*: 编号不连续，${pad3(sorted[i - 1])} 与 ${pad3(sorted[i])} 之间存在缺号`,
        });
      }
    }
  }
  return issues;
}

function pad3(value) {
  return String(value).padStart(3, "0");
}

function parseMetadata(text) {
  const metadata = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*>\s*\*\*(.+?)\*\*\s*[：:]\s*(.*)$/);
    if (!match) {
      if (/^##\s/.test(line)) break;
      continue;
    }
    metadata[match[1].trim()] = match[2].trim();
  }
  return metadata;
}

function splitSections(text) {
  const sections = new Map();
  const lines = text.split("\n");
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current !== null) sections.set(current, buffer.join("\n"));
      current = heading[1];
      buffer = [];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  if (current !== null) sections.set(current, buffer.join("\n"));
  return sections;
}

function caseTables(sectionText) {
  const tables = [];
  const groups = [];
  let group = [];
  for (const line of sectionText.split("\n")) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      group.push(line);
    } else if (group.length) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  for (const rows of groups) {
    const fields = {};
    for (const row of rows) {
      const cells = splitRow(row);
      if (cells.length < 2) continue;
      if (cells[0] === "项目" && cells[1] === "内容") continue;
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      fields[cells[0]] = cells.slice(1).join("|").trim();
    }
    if (Object.keys(fields).length) tables.push(fields);
  }
  return tables;
}

function functionalCaseIds(text) {
  const sections = splitSections(text);
  const functional =
    [...sections.entries()].find(([title]) => title.includes(SECTION.functional))?.[1] ?? "";
  const ids = [];
  for (const fields of caseTables(functional)) {
    const id = (fields["用例编号"] ?? "").trim();
    if (/^TC-/.test(id)) ids.push(id);
  }
  return ids;
}

function splitRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function toNumber(cell) {
  const cleaned = String(cell ?? "").replace(/[*,\s]/g, "");
  const value = Number.parseInt(cleaned, 10);
  return Number.isInteger(value) ? value : NaN;
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function indexTables(lines) {
  const tables = [];
  let heading = null;
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const cells = group.map(splitRow);
    const header = cells.find((row) => !isSeparatorRow(row)) ?? null;
    if (header) {
      tables.push({
        heading,
        header,
        rows: cells.filter((row) => row !== header && !isSeparatorRow(row)),
      });
    }
    group = [];
  };
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      heading = match[1];
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      group.push(line);
    } else {
      flush();
    }
  }
  flush();
  return tables;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function collect(target, files) {
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(target, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collect(path, files);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      if (SKIP_FILES.has(entry.name)) continue;
      files.push(path);
    }
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node scripts/lint-functional-testcases.mjs <path...>");
    console.log("  <path> 可以是功能测试用例仓库目录或单个 .md 文件");
    console.log("  扫描目录时若存在 INDEX.md，会校验其 TC 计数、链接、小计与总计");
    process.exitCode = args.length === 0 ? 1 : 0;
    return;
  }

  const files = [];
  const indexRoots = [];
  for (const arg of args) {
    const target = resolve(arg);
    if (await isDirectory(target)) {
      indexRoots.push(target);
      await collect(target, files);
    } else if (extname(target).toLowerCase() === ".md") {
      if (!SKIP_FILES.has(basename(target))) files.push(target);
    }
  }

  const results = [];
  const globalTc = new Map();
  for (const file of files.sort()) {
    const text = await readFile(file, "utf8");
    const label = basename(file);
    const { issues, tcIds } = lintContent(text, label);
    const reported = new Set();
    for (const id of new Set(tcIds)) {
      if (globalTc.has(id) && !reported.has(id)) {
        reported.add(id);
        issues.push({ level: "error", message: `${label}: 用例编号跨文件重复：${id}（另见 ${globalTc.get(id)}）` });
      } else if (!globalTc.has(id)) {
        globalTc.set(id, label);
      }
    }
    if (issues.length) results.push({ label: file, issues });
  }

  for (const root of indexRoots) {
    const indexPath = join(root, "INDEX.md");
    if (await exists(indexPath)) {
      const issues = await checkIndex(indexPath);
      if (issues.length) results.push({ label: indexPath, issues });
    }
  }

  const continuity = checkContinuity(globalTc);
  if (continuity.length) results.push({ label: "编号连续性", issues: continuity });

  let errorCount = 0;
  let warnCount = 0;
  for (const { label, issues } of results) {
    console.log(`\n${label}`);
    for (const issue of issues) {
      const tag = issue.level === "error" ? "ERROR" : "WARN ";
      if (issue.level === "error") errorCount += 1;
      else warnCount += 1;
      console.log(`  ${tag} ${issue.message}`);
    }
  }

  if (files.length === 0 && results.length === 0) {
    console.error("ERROR 未找到可校验的 .md 文件");
    process.exitCode = 1;
    return;
  }

  console.log(`\n检查文件 ${files.length} 个；错误 ${errorCount}，警告 ${warnCount}。`);
  if (errorCount > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ERROR ${error.message}`);
    process.exitCode = 1;
  });
}
