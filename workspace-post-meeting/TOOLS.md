# TOOLS.md — workspace-post-meeting

## 会后卡片投递（兜底）

**主流程**：scheduling 通过 **`workspace-scheduling/meetinglog/resolve-delivery.js`** 自动解析当前用户 **`target_user_open_id`** 并下发 **`delivery`** → post-meeting 写入会后 JSON → **card** 优先读 **`delivery`**。说明见 **`workspace-scheduling/TOOLS.md`**。本节仅 **手动 spawn / 缺 delivery** 时兜底。

**二选一：** **`target_user_open_id`**（单聊）或 **`target_chat_id`**（群）；可选 **`send_as`**。

示例（可与 scheduling TOOLS 保持一致）：

```markdown
- **target_user_open_id**: ou_e00060523f38e7f2e68680096b8e0fec
- **send_as**: user
```

## CLI 速查（详见 skill）

- `lark-cli vc meeting get` / `vc +search` / `vc +notes` / `vc +recording`
- `lark-cli docs +fetch --scope full`
- `lark-cli task +create --assignee "<本人>"`（可选）

## 禁止

- **`lark-cli im +messages-send`** — 由 **card** agent 执行  
- **替代 scheduling 写队列或改快照** — 由 `poll-calendar.sh` / scheduling 负责
