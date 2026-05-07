# HEARTBEAT.md — 定时轮询机制

## 架构概述（2026-05-02 更新）

**阶段 A 已改为纯脚本执行**，不再使用 OpenClaw cron agent。

```
┌─────────────────────────────────────────────────────────────┐
│  阶段 A：守护进程轮询 (每 30 秒)                               │
│  poll-daemon.sh → poll-calendar.sh                          │
│  职责：拉取未来窗 → 对比快照 → 写 new_events.jsonl；          │
│       拉取过去窗 → 已结束会议 → 写 ended_events.jsonl        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  阶段 B：会前派发 (每 60 秒)                                   │
│  cron: calendar-new-events-dispatch                         │
│  职责：resolve-delivery.js → 读 new_events.jsonl → spawn → pre-meeting │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  阶段 C：会后派发 (每 60 秒，可与 B 同配)                       │
│  cron: calendar-ended-events-dispatch                       │
│  职责：resolve-delivery.js → 读 ended_events.jsonl → spawn → post-meeting │
└─────────────────────────────────────────────────────────────┘
```

## 阶段 A：守护进程轮询

### 启动方式

```bash
# 启动守护进程
bash /home/node/.openclaw/workspace-scheduling/meetinglog/start-poll-daemon.sh

# 查看状态
cat /home/node/.openclaw/workspace-scheduling/meetinglog/poll-daemon.pid
tail -f /home/node/.openclaw/workspace-scheduling/meetinglog/daemon.log

# 停止守护进程
kill $(cat /home/node/.openclaw/workspace-scheduling/meetinglog/poll-daemon.pid)
```

### 职责

1. 每 30 秒执行一次 `poll-calendar.sh`
2. 调用 `lark-cli calendar +agenda` 拉取日程
3. 对比 `history_event_ids.json` 快照
4. 发现新日程时写入 `new_events.jsonl`；发现已结束会议时写入 `ended_events.jsonl`（去重见 `post_meeting_enqueued_event_ids.json`）
5. 更新快照文件（未来窗事件 ID）

### 日志文件

| 文件 | 说明 |
|------|------|
| `daemon.log` | 守护进程运行日志 |
| `poll.log` | 每次轮询的详细日志 |
| `poll-daemon.pid` | 守护进程 PID |

## 阶段 B：OpenClaw cron 派发（会前）

### Cron 任务配置

- **任务 ID**: `calendar-new-events-dispatch`
- **间隔**: 60 秒
- **职责**: `resolve-delivery.js` → 读 `new_events.jsonl` → `sessions_spawn` → `pre-meeting` agent

### 工作流程

1. 检查 `new_events.jsonl` 是否存在且有内容
2. 执行 **`node meetinglog/resolve-delivery.js`** 得到本轮共用的 **`delivery`**
3. 逐行解析 JSON，提取会议信息；每条 spawn 的 **`task`** 含锚点 + **`delivery`**
4. **全部成功**后清空 `new_events.jsonl`

## 阶段 C：OpenClaw cron 派发（会后）

### Cron 任务配置

- **任务 ID**: `calendar-ended-events-dispatch`
- **间隔**: 60 秒（可与阶段 B 一致）
- **职责**: `resolve-delivery.js` → 读 `ended_events.jsonl` → `sessions_spawn` → `post-meeting` agent

### 工作流程

1. 检查 `ended_events.jsonl` 是否存在且有内容
2. 执行 **`node meetinglog/resolve-delivery.js`** 得到 **`delivery`**
3. 逐行解析 JSON；每条 `sessions_spawn` → `post-meeting`，`task` 含锚点 + **`delivery`**，并要求 Read `workspace-post-meeting/skills/lark-post-meeting-followup/SKILL.md`
4. **全部成功派发后**清空 `ended_events.jsonl`；部分失败时与阶段 B 相同，勿误删未派发行

## 为何这样拆

- **性能**: 纯脚本执行轮询 + diff 只需 1-2 秒，无 LLM 延迟
- **稳定性**: 避免 agent 超时问题（之前连续 5 次 timeout）
- **成本**: 减少不必要的 LLM 调用
- **职责清晰**: 脚本负责「发现」，agent 负责「处理」
