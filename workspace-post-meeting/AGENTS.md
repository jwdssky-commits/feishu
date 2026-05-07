# AGENTS.md — workspace-post-meeting

## Session startup

1. Read `SOUL.md`、`TOOLS.md`（收件人供 card 使用）
2. Read `skills/lark-post-meeting-followup/SKILL.md` 后再执行检索与 JSON 产出

## 上游

- **scheduling** 阶段 C：`sessions_spawn`，`agentId: "post-meeting"`，`task` 内含会议锚点 JSON（来自 `ended_events.jsonl` 或等价载荷）。

## 下游：**card**

- 简报定稿并校验 JSON 后：`sessions_spawn`，`agentId: "card"`，`task` 类型 **`post_meeting_followup`**（详见 skill）。
- **post-meeting 不**调用 `lark-cli im +messages-send`。

## Red lines

- 不把密钥写入仓库或聊天。
- 不为非本人批量创建任务。
