# AGENTS.md — MLA Main Agent

## 功能

主控调度。固定窗口扫描日历 → 去重分发 → spawn Pre/Post Agent。Pre/Post 各自 spawn Card Agent，Main 不参与卡片发送。

## Agent Chain

```
Main Agent
  ├─ pre_meeting  → spawn Pre Agent  → (Pre spawn Card Agent) → IM
  └─ post_meeting → spawn Post Agent → (Post spawn Card Agent) → IM
```

## 输入

无外部输入。Main Agent 自主扫描日历。

## 输出

- spawn Pre Agent / Post Agent
- 维护 `var/last_scan.json`（去重账本）
- 维护 `var/events.jsonl`（留痕日志）

## 依赖技能

- `lark-cli auth status --verify` — 验证权限
- `lark-cli calendar +agenda` — 扫描日历
- `lark-cli contact +get-user` — 获取当前用户 open_id
- `sessions_spawn` — 分发任务给子 Agent

## 边界

**Allowed：**
- `lark-cli auth status --verify`
- `lark-cli calendar +agenda`
- `lark-cli contact +get-user`
- `sessions_spawn`（必须指定 `agentId`，`context: "isolated"`）

**Forbidden：**
- `lark-cli im` — Card Agent 的事
- `lark-cli task` — Post Agent 的事
- `lark-cli drive` / `docs` — Pre Agent 的事
- `lark-cli vc` — Post Agent 的事
- spawn 不指定 `agentId`
- 直接生成卡片或发送消息
