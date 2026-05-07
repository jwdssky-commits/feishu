---
name: lark-meeting-brief
version: 1.0.0
description: "会前简报：用 lark-cli 拉取云文档、历史视频会议纪要、IM 群聊记录，汇总为单一合法 JSON；简报定稿后必须通过 sessions_spawn 交给 card agent 发送卡片（pre-meeting 本人不直接 im 发卡片）。当用户需要会前准备、pre-meeting brief、会议背景汇总时使用。"
metadata:
  requires:
    bins: ["lark-cli"]
---

# Lark 会前简报（JSON + 派发 card）

> **前置条件：** Read [`../../../skills/lark-shared/SKILL.md`](../../../skills/lark-shared/SKILL.md)（`config init`、`auth login`、`--as user`、权限与报错处理）。  
> **采集阶段**统一 **`--as user`**（日历/云文档/IM 为用户资源）。

## 执行清单（建议顺序）

1. **收件人（以 scheduling 为准）**：从 **`sessions_spawn` task** 解析 **`delivery`** — 由 **scheduling** 通过 **`node meetinglog/resolve-delivery.js`**（或 **`delivery_override.json`**）生成并下发。若 task 未带 `delivery`：在本机执行 **`node ../workspace-scheduling/meetinglog/resolve-delivery.js`**（cwd 为 **workspace-pre-meeting** 根；容器路径对齐 **`/home/node/.openclaw`**）得到一行 JSON 作为 **`delivery`**；仍失败则 Read **`../workspace-scheduling/TOOLS.md`** 排障，再 fallback 本 workspace **`TOOLS.md`**（手动 spawn）。收件缺失则记入 `meta.errors`，card 仅 dry-run。  
2. 从当前 **`sessions_spawn` task** 解析**会议锚点**（见下节），映射进输出 JSON 的 `meeting`。  
3. 推导检索窗口：以锚点时间为中枢，**云文档 / IM** 取开会前 **14 天 → 开会后 0 天**（或任务另行指定）；**`vc +search`** 仅覆盖**已结束会议**，窗口按月拆分。  
4. 执行 **A → B → C**（CLI）；错误原样进 `meta.errors`，禁止臆造正文。  
5. 汇总为 **schema 1.0 JSON**（**必须**含 **`delivery`**（与 task/scheduling 一致）及完整 **`card_template`**）；体积过大则写入 `meetinglog/out/<ISO8601_compact>_<event_id 安全前缀>_pre_meeting_brief.json`（路径相对 **本 workspace 根**，首次执行前 `mkdir -p meetinglog/out`）。  
6. **`jq empty <file.json`** 或 **`python3 -m json.tool <file.json`** 校验合法后再派发 card。  
7. **`sessions_spawn` → `card`**（见「派发 card」），`task` 类型 **`pre_meeting_brief`**。

## 上游会议锚点（scheduling / `poll-calendar.sh`）

`workspace-scheduling/meetinglog/new_events.jsonl` 每行典型字段：

| 字段 | 说明 |
|------|------|
| `event_id` | 飞书日程实例 ID |
| `title` | 会议标题 |
| `start_time` / `end_time` | 起止（脚本写出 ISO 或 API 原始结构） |
| `participant_count` | 参会人数 |
| `discovered_at` | 发现时间（可选） |

调度 agent spawn 时 **必须**传入 **`delivery`**（来自 **`resolve-delivery.js`** 或 **`delivery_override.json`**，见 **`workspace-scheduling/TOOLS.md`**），与下列会议字段并列于 `task`。**还可能**传入 **`meeting_title` / `meeting_time`**（字符串或 `{ start, end, timezone }` 对象）。**统一映射**：

- `meeting.title` ← `meeting_title` 或 `title`  
- `meeting.scheduled_at` ← 可读的单字符串摘要（如 `2026-05-06 10:00–11:30 Asia/Shanghai`），若只能拿到结构化时间则拼接或填 UTC RFC3339  
- `meeting.timezone` ← 锚点中的 `timezone` 或 `null`  
- `meeting.participants_hint` ← 若有 attendee 列表则写入显示名；否则可用 `participant_count` 生成提示如 `"约 N 人（日历计数）"`  

`meeting.related_chat_ids` / `related_doc_urls_or_tokens`：若锚点或 USER/TOOLS 未提供，保持 **`[]`** / **`null`**，并在 `meta.coverage_gaps` 说明。

## D. （可选）日历日程详情补强

若仅有 `event_id` 且需要正文描述、会议室、参与人详情：

1. Read [`../../../skills/lark-calendar/SKILL.md`](../../../skills/lark-calendar/SKILL.md)。  
2. `lark-cli schema calendar.events.get` 查看参数后，用 **`lark-cli calendar events get --as user ...`**（具体 flags 以 schema 为准）拉取单条日程，将摘要写入 `meeting.objectives_user` 或 `sources` / `meta.assumptions`，**勿**把完整 attendee PII Dump 进 JSON。

## 目标

1. 用 **lark-cli** 收集：云文档、历史**视频会议纪要**、相关 **IM** 记录（时间与关键词可控）。
2. 归纳为背景、进展、风险、开放问题、建议议程等，产出 **一个严格合法的 JSON**（裸 JSON，默认无 Markdown 围栏）。
3. **卡片推送**：**禁止**在本会话内调用 `lark-cli im +messages-send` 发卡片；必须 **`sessions_spawn`**，`agentId: "card"`，由 **workspace-card** 按 [`../../../workspace-card/skills/lark-card/SKILL.md`](../../../workspace-card/skills/lark-card/SKILL.md) 发送。

## 授权（按需）

```bash
lark-cli auth login --domain drive,docs,im,vc
```

缺 scope 时：`lark-cli auth login --scope "<缺失的 scope>"`（见 `lark-shared`）。

---

## A. 云文档 / 知识库

**检索（优先云空间）**

```bash
lark-cli drive +search --as user --query "<关键词>" --format json --page-size 20
```

若无 `drive +search`：

```bash
lark-cli docs +search --as user --query "<关键词>" --format json
```

**Wiki URL** `.../wiki/<token>` → 真实 `obj_token`：

```bash
lark-cli wiki spaces get_node --as user --params '{"token":"<wiki_token>"}' --format json
```

**读正文**（控制体积）

```bash
lark-cli docs +fetch --as user --api-version v2 --doc "<URL 或 token>" --doc-format markdown --format json
lark-cli docs +fetch --as user --api-version v2 --doc "<URL 或 token>" --scope outline --doc-format markdown --format json
lark-cli docs +fetch --as user --api-version v2 --doc "<URL 或 token>" --scope keyword --keyword "<词|另一词>" --context-before 2 --context-after 4 --doc-format markdown --format json
```

**限制**：同一轮任务 **全文 fetch 同时 ≤ 3 篇**；其余用 outline / keyword。

---

## B. 历史视频会议纪要

对齐全局工作流思路（命令以 CLI 为准）：

```bash
lark-cli vc +search --as user --start "<YYYY-MM-DD>" --end "<YYYY-MM-DD>" --format json --page-size 30
lark-cli vc +notes --as user --meeting-ids "id1,id2,..."
lark-cli docs +fetch --as user --api-version v2 --doc "<note_token 或 URL>" --doc-format markdown --scope keyword --keyword "决议|待办|结论|TODO" --format json
```

单月窗口；更长则按月拆分。无纪要时在 `sources.past_meetings[]` 标明 `notes_available: false`。

详见 [`../../../skills/lark-workflow-meeting-summary/SKILL.md`](../../../skills/lark-workflow-meeting-summary/SKILL.md)、[`../../../skills/lark-vc/SKILL.md`](../../../skills/lark-vc/SKILL.md)。

---

## C. 群聊 / 会话

```bash
lark-cli im +chat-search --as user --query "<群名关键词>" --format json
lark-cli im +chat-messages-list --as user --chat-id "<oc_xxx>" \
  --start "<ISO8601>" --end "<ISO8601>" --sort desc --page-size 50 --format json
lark-cli im +messages-search --as user --query "<关键词>" \
  --start "<ISO8601>" --end "<ISO8601>" --chat-id "<oc_1,oc_2>" --page-size 30 --page-limit 10 --format json
```

详见 [`../../../skills/lark-im/SKILL.md`](../../../skills/lark-im/SKILL.md)。

---

## 编排建议

1. 用 spawn/task 中的会议锚点（`meeting_title`、`meeting_time`、`participant_count`、`event_id` 等）填充输出 JSON 的 `meeting` 段，并驱动检索关键词。  
2. 文档检索与 `vc +search`、IM 拉取可并行规划；**fetch 正文**宜串行并遵守篇数上限。  
3. CLI 错误写入 `meta.errors[]`，不编造未读内容。  
4. JSON 内勿堆砌完整聊天记录；敏感信息控制在摘要级。

---

## 输出：严格 JSON（schema 1.0）

仅 **一个** JSON 对象；键名 **snake_case**；可被 `jq .` / `python -m json.tool` 解析。

### 顶层

| 字段 | 类型 |
|------|------|
| `schema_version` | `"1.0"` |
| `generated_at` | RFC3339 字符串 |
| `meeting` | object |
| `sources` | object |
| `synthesis` | object |
| `delivery` | object（见下 · **scheduling 下发**，写入 JSON 供 card 读取） |
| `card_template` | object（见下 · 绑定 `pre_meeting_card.json`） |
| `meta` | object |

### `delivery`

```json
{
  "target_user_open_id": "string|null",
  "target_chat_id": "string|null",
  "send_as": "user|bot|null"
}
```

- 与 **`sessions_spawn` task** 中 scheduling 提供的 **`delivery`** 对齐（原样写入输出 JSON）。  
- **`send_as`**：`null` 时由 **card** 按 lark-card 默认规则推断。

### `meeting`

```json
{
  "title": "string",
  "scheduled_at": "string|null",
  "timezone": "string|null",
  "participants_hint": ["string"],
  "objectives_user": "string|null",
  "related_chat_ids": ["string"],
  "related_doc_urls_or_tokens": ["string"]
}
```

### `sources`

```json
{
  "cloud_documents": [
    {
      "title": "string",
      "url_or_token": "string",
      "retrieval_mode": "full|outline|keyword",
      "summary": "string",
      "key_points": ["string"],
      "open_questions_from_doc": ["string"]
    }
  ],
  "past_meetings": [
    {
      "meeting_id": "string|null",
      "title": "string|null",
      "start_time": "string|null",
      "notes_available": true,
      "summary": "string",
      "carry_over_actions": ["string"],
      "decisions_recalled": ["string"]
    }
  ],
  "chats": [
    {
      "chat_id": "string|null",
      "chat_name": "string|null",
      "time_range": {"start": "string", "end": "string"},
      "summary": "string",
      "themes": ["string"],
      "notable_decisions_or_blockers": ["string"]
    }
  ]
}
```

### `synthesis`

```json
{
  "background": "string",
  "current_status": ["string"],
  "risks_and_blockers": ["string"],
  "stakeholder_concerns": ["string"],
  "open_questions_for_chair": ["string"],
  "proposed_agenda": [
    { "topic": "string", "objective": "string", "time_budget_min": null }
  ],
  "recommended_reads": [
    { "title": "string", "url_or_token": "string", "reason": "string" }
  ],
  "recommended_experts": [
    { "name": "string", "topic": "string", "reason": "string" }
  ]
}
```

`recommended_experts`：可选；无可靠依据时 **`[]`**，并在 `meta.coverage_gaps` 说明（勿编造联系人）。

### `card_template`（必填 · 对应 [`../../../workspace-card/skills/lark-card/templates/pre_meeting_card.json`](../../../workspace-card/skills/lark-card/templates/pre_meeting_card.json)）

与模版占位符 **同名** 的键，供 **card** agent 做字符串替换 / JSON 注入（详见 **lark-card** skill）。所有字符串均为 **纯文本或飞书卡片 markdown 子集**，勿含未转义的控制字符；链接用 `https://` 或 feishu applink。

| 键 | 模版占位符 | 含义与填充建议 |
|----|------------|----------------|
| `meeting_summary` | `{{meeting_summary}}` | 会议标题（与 `meeting.title` 一致或简短版） |
| `meeting_url` | `{{meeting_url}}` | 日程/VC 详情链接；无则 `https://applink.feishu.cn` 或日历检索页，并在 `meta.coverage_gaps` 说明 |
| `meeting_date` | `{{meeting_date}}` | 单行日期，如 `2026-05-06`（与展示时区一致，默认按 UTC+8 文案写） |
| `meeting_time_range` | `{{meeting_time_range}}` | 时间段，如 `10:00-11:30` |
| `participant_count` | `{{participant_count}}` | **仅数字字符串**，如 `"3"`（模版后缀已有「人参会」） |
| `history_closed` | `{{history_closed}}` | 历史会议中**已有结论/已关闭**项的摘要 markdown |
| `history_closed_url` | `{{history_closed_url}}` | 左卡点击跳转 URL（无则 `#` 或纪要检索链接） |
| `history_pending` | `{{history_pending}}` | **待跟进/开放**项摘要 markdown |
| `history_pending_url` | `{{history_pending_url}}` | 右卡点击跳转 URL |
| `doc_rows` | `{{doc_rows}}` | **JSON 数组**（飞书 `column_set.columns` 元素列表），由 `sources.cloud_documents`、`recommended_reads` 等生成；无则 `[]` |
| `risk_items` | `{{risk_items}}` | `synthesis.risks_and_blockers` 等整理为 `- …` 列表 markdown |
| `expert_rows` | `{{expert_rows}}` | `recommended_experts` 渲染为多行，如 `**姓名** — 主题：…`；空则写 `暂无` |
| `footer` | `{{footer}}` | 灰字页脚：`generated_at`、`schema_version`；`meta.errors`/`coverage_gaps` 非空时简短一句 |

**`doc_rows` 元素示例**（单列文档一条；多文档多个 `column`，结构需符合飞书 interactive card）：

```json
[
  {
    "tag": "column",
    "width": "weighted",
    "weight": 1,
    "background_style": "blue-50",
    "padding": "12px",
    "elements": [
      {
        "tag": "interactive_container",
        "behaviors": [{ "type": "open_url", "default_url": "https://..." }],
        "elements": [{ "tag": "markdown", "content": "[文档标题](https://...)\\n一行摘要" }]
      }
    ]
  }
]
```

### `meta`

```json
{
  "cli_identity": "user",
  "assumptions": ["string"],
  "errors": ["string"],
  "coverage_gaps": ["string"]
}
```

### 硬性规则

- 禁止注释、尾逗号、`NaN`、未引号键。  
- **`delivery` 必填**（对象键可存在且值为 `null`，但结构须有）：须能从 task 或 **`resolve-delivery.js`** / **`delivery_override.json`** 得到收件人；否则 `meta.errors` 记录且 card 只能 dry-run。  
- **`card_template` 必填**：缺少任一键或 `doc_rows` 非数组则视为未就绪，不得派发 card。  
- 默认 **仅输出裸 JSON**（用户明确要求时才加简短说明）。  
- 超大简报可先写入 `meetinglog/out/<timestamp>_pre_meeting_brief.json`，再在 `sessions_spawn` 的 `task` 里传 **绝对路径**（推荐 **`$HOME/.openclaw/workspace-pre-meeting/meetinglog/out/...`** 或容器内等价路径）。

### JSON 校验（派发前必做）

```bash
jq empty ./meetinglog/out/your_brief.json
# 或
python3 -m json.tool < ./meetinglog/out/your_brief.json > /dev/null
```

---

## 派发 **card**（`sessions_spawn`，必选）

简报 JSON **定稿后**：

- `agentId`: **`"card"`**  
- `runtime`: `"subagent"`（与项目一致即可）  
- `mode`: `"run"`（若运行时支持）  
- `label`: 如 `brief-<event_id 短前缀>`  
- `task`: **必须**让读者能识别 **`pre_meeting_brief`**，并包含下列之一：  
  - **内联**：完整简报 JSON（仅在不超长时）；或  
  - **路径**：`brief_json_path: "<绝对路径>"`  
  同时要求对方：**Read** [`../../../workspace-card/skills/lark-card/SKILL.md`](../../../workspace-card/skills/lark-card/SKILL.md)，按其中 **「会前简报（pre_meeting_brief）」** 使用模版 **[`templates/pre_meeting_card.json`](../../../workspace-card/skills/lark-card/templates/pre_meeting_card.json)** 渲染并发送（**唯一**会前卡片底稿）。

**`task` 正文示例**（路径版，推荐）：

```text
类型：pre_meeting_brief

Read ~/.openclaw/workspace-card/skills/lark-card/SKILL.md（会前简报一节）。
简报 JSON 文件（已通过 jq 校验）：/home/node/.openclaw/workspace-pre-meeting/meetinglog/out/20260503T080000Z_evtabc_pre_meeting_brief.json

收件人与发送身份：**优先**从简报 JSON 顶层 **`delivery`** 读取（scheduling 经 **`resolve-delivery.js`** 生成）；若无则按 **lark-card** skill 顺序 fallback。主投递策略见 **workspace-scheduling/TOOLS.md**（非手写 `open_id` 段落）。
```

**`task` 示例**（内联摘要版，仅当 JSON 较小）：

```text
类型：pre_meeting_brief

Read ~/.openclaw/workspace-card/skills/lark-card/SKILL.md。
简报 JSON（贴在下方，schema 1.0）：
{ "schema_version": "1.0", ... }
```

若返回 `agentId is not allowed`：检查 `openclaw.json` 里 **`agents.defaults.subagents.allowAgents`** 是否包含 **`card`**（或 **`*`**），以及 **`tools.subagents.tools.allow`** 是否包含 **`sessions_spawn`**。  
若提示已达 **子代理深度上限**（如 **depth 1/1**）：在 **`agents.defaults.subagents`** 设置 **`maxSpawnDepth`: `2`**（勿写在 **`agents.list[]`** 内），重启 gateway 后再试。

---

## 参考

- [`../../../skills/lark-shared/SKILL.md`](../../../skills/lark-shared/SKILL.md)
- [`../../../skills/lark-calendar/SKILL.md`](../../../skills/lark-calendar/SKILL.md)
- [`../../../skills/lark-drive/SKILL.md`](../../../skills/lark-drive/SKILL.md)
- [`../../../skills/lark-im/SKILL.md`](../../../skills/lark-im/SKILL.md)
- [`../../../skills/lark-openapi-explorer/SKILL.md`](../../../skills/lark-openapi-explorer/SKILL.md)
- [`../../../workspace-card/skills/lark-card/SKILL.md`](../../../workspace-card/skills/lark-card/SKILL.md)
