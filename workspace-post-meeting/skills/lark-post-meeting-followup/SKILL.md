---
name: lark-post-meeting-followup
version: 1.0.0
description: "会后闭环：用 lark-cli 检索飞书视频会议纪要/逐字稿、必要时补强日历锚点，汇总为单一合法 JSON；定稿后必须通过 sessions_spawn 交给 card agent 发送会后纪要卡片（post-meeting 本人不直接 im 发卡片）。"
metadata:
  requires:
    bins: ["lark-cli"]
---

# Lark 会后闭环（JSON + 派发 card）

> **前置条件：** Read [`../../../skills/lark-shared/SKILL.md`](../../../skills/lark-shared/SKILL.md)（`config init`、`auth login`、`--as user`、权限与报错处理）。  
> **采集阶段**统一 **`--as user`**（日历 / VC / 文档为用户资源）。

## 执行清单（建议顺序）

1. **收件人（以 scheduling 为准）**：从 **`sessions_spawn` task** 解析 **`delivery`**（scheduling 经 **`resolve-delivery.js`** / **`delivery_override.json`** 生成）。若缺失：执行 **`node ../workspace-scheduling/meetinglog/resolve-delivery.js`**（cwd 为 **workspace-post-meeting** 根）；仍失败则 Read **`../workspace-scheduling/TOOLS.md`**，再 fallback 本 workspace **`TOOLS.md`**。规则同 **lark-meeting-brief**。
2. 从当前 **`sessions_spawn` task** 解析**会议锚点**（见下节），映射进输出 JSON 的 `meeting`。
3. **VC / 纪要检索**（与会前简报同源命令族，侧重**已结束会议**）：
   - 优先：`lark-cli vc meeting get --as user --params '{"meeting_id":"<id>","query_mode":1}' --format json`（若有 `vc_meeting_id`）
   - 否则：`vc +search`（按标题关键词 + 锚点日期窗口）→ `vc +notes` → 若无纪要则 `vc +recording` → `vc +notes --minute-tokens`（以当前 CLI schema 为准）
   - 正文：`lark-cli docs +fetch --as user --api-version v2 --doc "<token 或 URL>" --scope full --doc-format markdown --format json`（纪要 HTML/markdown 过大时用 `keyword` 分段，错误写入 `meta.errors`）
4. **（可选）待办**：若纪要中有指派给你的动作项，可用 `lark-cli task +create --assignee "<本人 open_id>"`；**禁止**给非本人批量建任务；失败记入 `meta.errors`。
5. 汇总为 **schema 1.0 JSON**（**必须**含 **`delivery`** + 完整 **`card_template`**）；体积过大则写入 `meetinglog/out/<ISO8601_compact>_<event_id 安全前缀>_post_meeting_followup.json`（路径相对 **本 workspace 根**，首次执行前 `mkdir -p meetinglog/out`）。
6. **`jq empty <file.json`** 或 **`python3 -m json.tool <file.json`** 校验合法后再派发 card。
7. **`sessions_spawn` → `card`**（见「派发 card」），`task` 类型 **`post_meeting_followup`**。

## 上游会议锚点（scheduling / `ended_events.jsonl`）

`workspace-scheduling/meetinglog/ended_events.jsonl` 每行典型字段：

| 字段 | 说明 |
|------|------|
| `event_id` | 飞书日程实例 ID |
| `title` | 会议标题 |
| `start_time` / `end_time` | 起止 |
| `participant_count` | 参会人数 |
| `ended_discovered_at` | 脚本发现「已结束」的时间（可选） |

调度 agent spawn 时 **必须**传入 **`delivery`**（来自 **`resolve-delivery.js`** 或 **`delivery_override.json`**）。**还可能**传入 **`meeting_title` / `meeting_time`**、`vc_meeting_id`、`organizer_open_id` 等。**统一映射**：

- `meeting.calendar_event_id` ← `event_id`  
- `meeting.title` ← `meeting_title` 或 `title`  
- `meeting.scheduled_at` / `meeting.ended_at` ← 可读摘要或 RFC3339  
- `meeting.participants_hint` ← 若有 attendee 列表则写显示名；否则可用 `participant_count`  
- `meeting.vc_meeting_id` ← 若能从 VC 搜索命中则填入，否则 `null`

## D. （可选）日历日程详情补强

若仅有 `event_id` 且需会议室、描述等：Read [`../../../skills/lark-calendar/SKILL.md`](../../../skills/lark-calendar/SKILL.md)，`lark-cli calendar events get --as user ...`（flags 以 schema 为准）。

---

## VC / 纪要检索要点

```bash
lark-cli vc meeting get --as user --params '{"meeting_id":"<id>","query_mode":1}' --format json
lark-cli vc +search --as user --start "<YYYY-MM-DD>" --end "<YYYY-MM-DD>" --format json --page-size 30
lark-cli vc +notes --as user --meeting-ids "id1,id2,..."
lark-cli vc +recording --as user --meeting-ids "<id>" --format json
lark-cli docs +fetch --as user --api-version v2 --doc "<note_token>" --scope full --doc-format markdown --format json
```

详见 [`../../../skills/lark-workflow-meeting-summary/SKILL.md`](../../../skills/lark-workflow-meeting-summary/SKILL.md)、[`../../../skills/lark-vc/SKILL.md`](../../../skills/lark-vc/SKILL.md)。

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
| `delivery` | object（与 **lark-meeting-brief** 的 `delivery` schema 相同 · scheduling 下发） |
| `card_template` | object（见下 · 绑定 `post_meeting_card.json`） |
| `meta` | object |

### `delivery`

与 [`lark-meeting-brief` 的 `delivery` 定义](../../../workspace-pre-meeting/skills/lark-meeting-brief/SKILL.md) 一致；须原样写入输出 JSON，供 **card** 优先读取。

### `meeting`

```json
{
  "title": "string",
  "calendar_event_id": "string|null",
  "vc_meeting_id": "string|null",
  "scheduled_at": "string|null",
  "ended_at": "string|null",
  "timezone": "string|null",
  "duration_minutes": null,
  "participant_count": null,
  "participants_hint": ["string"],
  "organizer_hint": "string|null",
  "vchat_url": "string|null",
  "app_link": "string|null"
}
```

### `sources`

```json
{
  "calendar": {},
  "vc_note": {
    "note_doc_token_or_url": "string|null",
    "verbatim_doc_token_or_url": "string|null",
    "retrieval_notes": "string|null"
  },
  "past_meetings": []
}
```

### `synthesis`

```json
{
  "summary": "string",
  "key_conclusions": ["string"],
  "decisions": ["string"],
  "follow_up_outputs": [
    { "title": "string", "owner_hint": "string|null", "link": "string|null" }
  ],
  "action_items": [
    { "text": "string", "assignee_hint": "string|null", "due_hint": "string|null", "priority_hint": "string|null" }
  ],
  "discussion_highlights": ["string"]
}
```

### `meta`

```json
{
  "cli_identity": "user",
  "assumptions": ["string"],
  "errors": ["string"],
  "coverage_gaps": ["string"],
  "tasks_created_for_self": ["string"]
}
```

### `card_template`（必填 · 对应 [`../../../workspace-card/skills/lark-card/templates/post_meeting_card.json`](../../../workspace-card/skills/lark-card/templates/post_meeting_card.json)）

与模版占位符 **同名** 的键，供 **card** agent 替换（详见 **lark-card** skill）。

| 键 | 模版占位符 | 含义与填充建议 |
|----|------------|----------------|
| `meeting_time_block` | `{{meeting_time_block}}` | 会议时间多行说明（可与 `meeting.scheduled_at`/`ended_at`/时区一致） |
| `participants_block` | `{{participants_block}}` | 参会人列表或 `约 N 人` + `participants_hint` 摘要 |
| `meeting_id` | `{{meeting_id}}` | 优先 `meeting.vc_meeting_id`，否则 `meeting.calendar_event_id`；无则 `未知` |
| `duration_minutes` | `{{duration_minutes}}` | **字符串**，如 `"31"`（仅数字或 `未知`） |
| `core_conclusions` | `{{core_conclusions}}` | `synthesis.key_conclusions` 编号列表 markdown |
| `decisions` | `{{decisions}}` | `synthesis.decisions` 列表 markdown |
| `action_items_rows` | `{{action_items_rows}}` | **JSON 数组**：表格行，元素形如 `{"id":"1","assignee":"张三","task":"事项"}`（列名固定：`id` / `assignee` / `task`） |
| `related_links` | `{{related_links}}` | 纪要/逐字稿/VC 等链接 markdown |
| `footer` | `{{footer}}` | 灰字页脚：`generated_at`、`schema_version`；错误/缺口提示 |

无纪要时：`core_conclusions`/`decisions` 写「暂无可靠纪要数据」，**仍须**给出合法的 `action_items_rows`（可为 `[]`）与 `related_links`（可含日历链接）。

### 硬性规则

- 禁止注释、尾逗号、臆造未读纪要正文；检索失败写入 `meta.errors` / `meta.coverage_gaps`。  
- **`delivery` 必填**（规则同会前）：须能从 task 或 **`resolve-delivery.js`** / **`delivery_override.json`** 得到收件人。  
- **`card_template` 必填**：缺少任一键或 `action_items_rows` 非数组则视为未就绪，不得派发 card。  
- 默认 **仅输出裸 JSON**（用户明确要求时才加简短说明）。  
- 超大时可写入 `meetinglog/out/<timestamp>_post_meeting_followup.json`，在 `sessions_spawn` 的 `task` 里传 **`post_meeting_json_path`** 绝对路径。

### JSON 校验（派发前必做）

```bash
jq empty ./meetinglog/out/your_followup.json
```

---

## 派发 **card**（`sessions_spawn`，必选）

纪要 JSON **定稿后**：

- `agentId`: **`"card"`**  
- `runtime`: `"subagent"`  
- `mode`: `"run"`  
- `label`: 如 `post-<event_id 短前缀>`  
- `task`: **必须**标明 **`post_meeting_followup`**，并包含：
  - **`post_meeting_json_path`**：已通过校验的 JSON **绝对路径**；或  
  - 内联完整 JSON（仅在不超长时）

同时要求对方：**Read** [`../../../workspace-card/skills/lark-card/SKILL.md`](../../../workspace-card/skills/lark-card/SKILL.md)，按其中 **「会后闭环（post_meeting_followup）」** 使用模版 **[`templates/post_meeting_card.json`](../../../workspace-card/skills/lark-card/templates/post_meeting_card.json)** 渲染并发送（**唯一**会后卡片底稿）。

**`task` 正文示例**（路径版，推荐）：

```text
类型：post_meeting_followup

Read /home/node/.openclaw/workspace-card/skills/lark-card/SKILL.md（会后闭环一节）。
会后 JSON 文件（已通过 jq 校验）：/home/node/.openclaw/workspace-post-meeting/meetinglog/out/20260505T100000Z_evt_post_meeting_followup.json

收件人与发送身份：**优先**从会后 JSON 顶层 **`delivery`** 读取（scheduling 下发）；fallback 顺序见 **lark-card** skill（含 **`workspace-scheduling/TOOLS.md`** / 本 workspace TOOLS）。
```

---

## 参考

- [`../../../skills/lark-shared/SKILL.md`](../../../skills/lark-shared/SKILL.md)  
- [`../../../skills/lark-calendar/SKILL.md`](../../../skills/lark-calendar/SKILL.md)  
- [`../../../workspace-pre-meeting/skills/lark-meeting-brief/SKILL.md`](../../../workspace-pre-meeting/skills/lark-meeting-brief/SKILL.md)（流程对齐参考）  
- [`../../../workspace-card/skills/lark-card/SKILL.md`](../../../workspace-card/skills/lark-card/SKILL.md)
