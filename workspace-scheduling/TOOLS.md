# TOOLS.md — workspace-scheduling

## 职责拆分（与 `SOUL.md` / `HEARTBEAT.md` 一致）

| 环节 | 谁做 | 说明 |
|------|------|------|
| 定时「只看日历」 | **scheduling**（cron 唤醒） | `lark-cli calendar +agenda`，可选写 `meetinglog/last_agenda_poll.json` |
| 快照 diff、写 `new_events.jsonl`；扫描已结束会议写 `ended_events.jsonl` | **`meetinglog/poll-calendar.sh`**（建议系统 cron） | 对比 `history_event_ids.json`；会后队列入队见 `enqueue-ended-events.js` |
| 读新事件 → `sessions_spawn` → **pre-meeting** | **阶段 B**（单独会话/cron/用户触发） | 仅在已存在新增日程信号后执行 |
| 读 `ended_events.jsonl` → `sessions_spawn` → **post-meeting** | **阶段 C**（cron **`calendar-ended-events-dispatch`** / 用户触发） | 仅在已存在已结束会议队列后执行 |

## 真实命令（心跳）

```bash
lark-cli auth login --domain calendar   # 按需
lark-cli calendar +agenda --as user \
  --calendar-id "<calendar_id 或省略>" \
  --start "<ISO8601>" --end "<ISO8601>" \
  --format json
```

## 虚构工具声明

以下名称 **未** 作为网关内置工具挂载，实施时请使用 **lark-cli** 与 **sessions_spawn**：

- ~~`lark_get_calendar_events`~~ → `lark-cli calendar +agenda`
- ~~`dispatch_task_to_agent`~~ → `sessions_spawn`，`agentId: "pre-meeting"`（阶段 B）或 **`post-meeting`**（阶段 C）
- ~~`update_local_event_cache`~~ → 由 **`poll-calendar.sh`** 维护 `history_event_ids.json`

---

## 卡片投递：`delivery` 与 **`target_user_open_id`（默认自动解析）**

阶段 B / C 在 **`sessions_spawn`** 前必须得到 **`delivery`**（`target_user_open_id` / `target_chat_id` / `send_as`），规则如下。

### 1）默认（推荐）：自动获取当前登录用户 `open_id`

执行（workspace 根为 **`workspace-scheduling`**）：

```bash
node /home/node/.openclaw/workspace-scheduling/meetinglog/resolve-delivery.js
```

（本机若路径为 `~/.openclaw`，把前缀改成你的实际路径。）

- 脚本内部调用：**`lark-cli contact +get-user --as user --format json`**（不传 `--user-id` = 当前用户，见 [`skills/lark-contact/references/lark-contact-get-user.md`](../skills/lark-contact/references/lark-contact-get-user.md)）。
- **stdout 为一行 JSON**，可直接作为 `delivery` 对象（例如 `target_user_open_id`、`target_chat_id`: null、`send_as`: user）。

**前置**：与日历一致，需 **`lark-cli auth login`** 已完成 **用户身份**授权；若命令失败，按 CLI 报错补齐 scope 或改用下文「手工覆盖」。

### 2）可选覆盖：`meetinglog/delivery_override.json`

若存在该文件且包含 **`target_user_open_id`** 或 **`target_chat_id`**，**`resolve-delivery.js` 只输出该文件内容（规范化字段），不再调用 CLI** —— 用于固定发到指定人或群、或 CLI 解析失败时的应急。

示例：

```json
{
  "target_user_open_id": "ou_xxxxxxxxxxxxxxxxxx",
  "target_chat_id": null,
  "send_as": "user"
}
```

发到群时示例：

```json
{
  "target_user_open_id": null,
  "target_chat_id": "oc_xxxxxxxxxxxxxxxxxx",
  "send_as": "bot"
}
```

### 3）写入 `task`

将上一步得到的 **`delivery`** 与会议锚点一并写入 **`sessions_spawn` 的 `task`**（详见 `SOUL.md`、pre/post-meeting skills）。

**不要在 pre-meeting / post-meeting 的 TOOLS.md 维护主副本**（仅手动 spawn 兜底）。
