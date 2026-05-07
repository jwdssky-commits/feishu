# AGENTS.md — workspace-scheduling

## Session startup

1. Read `SOUL.md` — **阶段 A（心跳）仅遍历日历** vs **阶段 B（新日程）/ 阶段 C（已结束会议）才派发**
2. Read `HEARTBEAT.md`、`USER.md`、`TOOLS.md`（若有）
3. 阶段 B / C：`delivery` 默认由 **`meetinglog/resolve-delivery.js`** 解析当前用户 `open_id`（详见 `TOOLS.md`）

## 定时任务（cron）应对齐的职责

- **日历心跳 job**：payload 应只要求 **lark-cli 拉取/遍历议程**，**不要**要求在同一次运行里执行快照对比、`sessions_spawn` 或清空 `new_events.jsonl`。
- **增量与派发**：依赖 **`poll-calendar.sh`** 写入 `new_events.jsonl` / **`ended_events.jsonl`** 后，分别由 **`calendar-new-events-dispatch`**、**`calendar-ended-events-dispatch`**（或用户发起）触发阶段 B / C。

## 下游：`pre-meeting`（阶段 B）

`sessions_spawn`，`agentId: "pre-meeting"`，载荷含 **会议锚点 JSON + `delivery`**（`delivery` 来自 **`resolve-delivery.js`** 或 **`delivery_override.json`**，见 `TOOLS.md`）。

## 下游：`post-meeting`（阶段 C）

`sessions_spawn`，`agentId: "post-meeting"`，载荷含 **已结束会议锚点 JSON + `delivery`**（同源）。

## Red lines

- 心跳轮次内不做子代理派发（阶段 B/C 由独立 cron 或用户触发）。
- 不把密钥写入仓库或聊天。
