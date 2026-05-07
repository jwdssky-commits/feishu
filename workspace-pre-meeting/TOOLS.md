# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

### Pre-meeting 卡片投递（兜底）

**主流程**：**scheduling** 运行 **`meetinglog/resolve-delivery.js`** 自动得到当前用户 **`open_id`**，经 **`delivery`** 传给 pre-meeting 并写入简报 JSON；**card** **优先**读 JSON 里的 **`delivery`**。可选 **`delivery_override.json`** 见 **`workspace-scheduling/TOOLS.md`**。

本节 **仅**在「手动 spawn、未带 `delivery`」时供 card **兜底**（见 **lark-card** skill）。

**二选一（优先由上到下）：**

1. **本人单聊** — **`target_user_open_id`**：`ou_xxxx`  
2. **群** — **`target_chat_id`**：`oc_xxxx`  

可选 **`send_as`**：`user` | `bot`。

示例：

```markdown
- **target_user_open_id**: ou_xxxxxxxxxxxxxxxxxx
- **send_as**: user
```

## 当前配置（兜底 · 可与 scheduling 同步一份便于手工）

- **target_user_open_id**: ou_e00060523f38e7f2e68680096b8e0fec
- **send_as**: user

授权示例（用户身份发消息）：

```bash
lark-cli auth login --scope "im:message,im:message.send_as_user"
```

### 排障：`Tool read not found`（子代理）

pre-meeting 由 **`sessions_spawn`** 运行时走的是 **子代理工具策略**。若 **`openclaw.json`** 里 **`tools.subagents.tools.allow`** 只有 **`sessions_send`**，模型调用 **`read`** / **`exec`** / **`sessions_spawn`** 会报 **Tool … not found**。  
请在 **`allow`** 中至少加入 **`read`**、**`exec`**、**`write`**、**`sessions_spawn`**（与当前仓库 **`openclaw.json`** 对齐），**重启 OpenClaw gateway（或承载 agent 的进程）** 后再试。

### 排障：子代理 depth 1/1，无法 `sessions_spawn` → card

OpenClaw 默认 **`agents.defaults.subagents.maxSpawnDepth`** 为 **`1`** 时，**第一层子代理是 leaf**，不能再 **`sessions_spawn`**。  
要在 **pre-meeting（depth 1）** 再拉起 **card（depth 2）**，须在 **`agents.defaults.subagents`** 设置 **`maxSpawnDepth`: `2`**（最大可到 `5`）。**不要**写在 **`agents.list[].subagents`**（部分版本会报未知字段）。改完后 **重启 gateway**；新起的子代理上下文应显示 **depth 1/2**（或等价），**depth 2** 仍为叶子，不能再嵌套 spawn。

---

Add whatever helps you do your job. This is your cheat sheet.
