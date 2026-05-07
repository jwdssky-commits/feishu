# TOOLS.md — MLA Main Agent

## CLI 接口

### Auth

```bash
lark-cli auth status --verify
```

### 获取当前用户

```bash
lark-cli contact +get-user --as user --format json
# 取 data.user.open_id → ME
```

### 日历扫描

```bash
lark-cli calendar +agenda --start "<now-35min-iso>" --end "<now+30min-iso>" --as user --format json
# 时间用 ISO 8601 格式：2026-05-04T12:00:00+08:00
# 返回字段：event_id, summary, start_time, end_time, vchat.meeting_url, app_link, event_organizer
```

### sessions_spawn

```json
{"agentId":"mla-pre-agent","runtime":"subagent","context":"isolated","mode":"run","cleanup":"keep","runTimeoutSeconds":600,"task":"<task文本>"}
```

```json
{"agentId":"mla-post-agent","runtime":"subagent","context":"isolated","mode":"run","cleanup":"keep","runTimeoutSeconds":300,"task":"<task文本>"}
```

## 状态文件

| 文件 | 模式 | 结构 |
|------|------|------|
| `var/last_scan.json` | 覆盖写 | `{"<event_id>": {"dispatched": ["pre_meeting"]}}` |
| `var/events.jsonl` | 追加写 | `{"timestamp": ..., "event_id": "...", "summary": "...", "action": "spawn_pre_agent"}` |

## 禁止

- `lark-cli calendar +create` / `+update` — 不改日历
- `lark-cli vc` / `docs` / `drive` — 子 Agent 的事
- `lark-cli im` — Card Agent 的事
- `lark-cli task` — Post Agent 的事
