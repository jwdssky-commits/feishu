---
name: lark-card
version: 1.0.0
description: "飞书消息卡片：会前固定使用 templates/pre_meeting_card.json，会后固定使用 templates/post_meeting_card.json；由上游 JSON 的 card_template 字段填充占位符后经 lark-cli im +messages-send 发送。另有 meeting_minutes_card.schema2.json 可作手工/兜底参考。"
metadata:
  requires:
    bins: ["lark-cli"]
---

# Lark 卡片模版与发送

> **前置条件：** Read [`../../../skills/lark-shared/SKILL.md`](../../../skills/lark-shared/SKILL.md)。发送前 Read [`../../../skills/lark-im/references/lark-im-messages-send.md`](../../../skills/lark-im/references/lark-im-messages-send.md)（确认收件人、内容、bot/user）。

## 占位符替换（会前 / 会后通用）

模版文件中是 **合法 JSON 语法 + `{{键名}}` 占位符**。渲染步骤：

1. 读取上游 **`card_template`** 对象（见各 agent skill）。
2. 将模版路径 [`templates/pre_meeting_card.json`](templates/pre_meeting_card.json) 或 [`templates/post_meeting_card.json`](templates/post_meeting_card.json) 读入 **字符串** `tpl`（勿先 `JSON.parse`）。
3. **数组注入**（必须先做，避免与 `{{…}}` 冲突）  
   - **会前**：将 **`"columns":"{{doc_rows}}"`** 整段替换为 **`"columns":`** + `JSON.stringify(card_template.doc_rows)`。  
   - **会后**：将 **`"rows": "{{action_items_rows}}"`** 整段替换为 **`"rows":`** + `JSON.stringify(card_template.action_items_rows)`。
4. **字符串占位符**：对 `card_template` 里**其余每个**键 `k`（字符串值），将 `tpl` 中所有字面量 **`{{k}}`** 替换为：把 `String(card_template[k])` 做 **JSON 字符串转义**后的内容（等价于 `JSON.stringify(值).slice(1, -1)`，用于嵌入 JSON 的字符串字面量内部）。  
   - **禁止**再包一层引号。  
5. `JSON.parse(tpl)` 应成功；将结果 **`write`** 到 `meetinglog/out/<id>_rendered_card.json` 再发送。解析失败则检查占位符是否遗漏、或 `doc_rows`/表格行是否非数组。

## 参考模版：会议纪要整卡（可选）

完整卡片 JSON 样例（非会前/会后固定流程）：[`templates/meeting_minutes_card.schema2.json`](templates/meeting_minutes_card.schema2.json)

## 收件人与 `send_as`（`pre_meeting_brief` / `post_meeting_followup`）

**优先级从高到低**：

1. 简报 / 会后 JSON 顶层 **`delivery`**（由 **scheduling** 经 **`resolve-delivery.js`**（或 **`delivery_override.json`**）生成，经 pre/post-meeting **原样写入** JSON）。  
2. 当前 **`sessions_spawn` task** 正文中显式写明的 **`target_user_open_id`** / **`target_chat_id`** / **`send_as`**。  
3. 执行 **`node <workspace-scheduling>/meetinglog/resolve-delivery.js`**（与 scheduling 同源），或按 **`workspace-scheduling/TOOLS.md`** 使用 **`delivery_override.json`**。  
4. 兜底：会前读 **`workspace-pre-meeting/TOOLS.md`**；会后读 **`workspace-post-meeting/TOOLS.md`**（仅手动 spawn）。

发送规则不变：**`target_user_open_id`** → `--user-id`（默认 **`--as user`**）；**`target_chat_id`** → `--chat-id`（默认 **`--as bot`**）；**`send_as`** 可覆盖默认。两者皆空则仅 **`--dry-run`**。

## 会前简报（`pre_meeting_brief`）

当 **pre-meeting** 派发且 `task` 类型为 **`pre_meeting_brief`** 时：

1. 读取 **会前简报 JSON**（`schema_version` `1.0`，含 **`delivery`** + **`card_template`**），路径由 `task` / `brief_json_path` 给出。结构见 [`workspace-pre-meeting/skills/lark-meeting-brief/SKILL.md`](../../../workspace-pre-meeting/skills/lark-meeting-brief/SKILL.md)。
2. 用 **`card_template`** + 本节 **「占位符替换」** 渲染 [`templates/pre_meeting_card.json`](templates/pre_meeting_card.json)。**不要**再使用 `pre_meeting_brief_card.schema2.json` 作为默认发送模版。
3. **收件 / 发送身份**：按上文 **「收件人与 send_as」** 解析。

## 会后闭环（`post_meeting_followup`）

当 **post-meeting** 派发且 `task` 类型为 **`post_meeting_followup`** 时：

1. 读取 **会后 JSON**（含 **`delivery`** + **`card_template`**），路径由 `task` / `post_meeting_json_path` 等给出。结构见 [`workspace-post-meeting/skills/lark-post-meeting-followup/SKILL.md`](../../../workspace-post-meeting/skills/lark-post-meeting-followup/SKILL.md)。
2. 用 **`card_template`** + **「占位符替换」** 渲染 [`templates/post_meeting_card.json`](templates/post_meeting_card.json)。**不要**再使用 `meeting_minutes_card.schema2.json` 作为默认会后模版。
3. **收件 / 发送身份**：按上文 **「收件人与 send_as」** 解析。

## 用 lark-cli 发送

1. 授权（按发送身份二选一）：

```bash
# 以用户身份发消息（本人单聊卡片推荐）
lark-cli auth login --scope "im:message,im:message.send_as_user"

# 以应用机器人发消息（常见：发到群）
lark-cli auth login --scope "im:message,im:message:send_as_bot"
```

2. 将**最终卡片对象**读成一行 JSON 后发送（路径改为你的输出文件）。

**发给本人单聊（推荐 `--as user`，`open_id` `ou_xxx`）：**

```bash
CARD_JSON=$(node -p "JSON.stringify(require('./meetinglog/out/my_card.json'))")
lark-cli im +messages-send --as user --user-id "<ou_xxx>" \
  --msg-type interactive --content "$CARD_JSON" --dry-run
```

**发到群（`--chat-id`，常见 `--as bot`）：**

```bash
CARD_JSON=$(node -p "JSON.stringify(require('./meetinglog/out/my_card.json'))")
lark-cli im +messages-send --as bot --chat-id "<oc_xxx>" \
  --msg-type interactive --content "$CARD_JSON" --dry-run
```

**本人单聊但强制用机器人身份（仅当 TOOLS 写明 `send_as: bot`）：**

```bash
CARD_JSON=$(node -p "JSON.stringify(require('./meetinglog/out/my_card.json'))")
lark-cli im +messages-send --as bot --user-id "<ou_xxx>" \
  --msg-type interactive --content "$CARD_JSON" --dry-run
```

3. 若网关返回结构不匹配，再尝试**官方 raw 包装**（以当前租户 API 为准）：

```bash
RAW=$(node -p "JSON.stringify({type:'raw',data:require('./meetinglog/out/my_card.json')})")
lark-cli im +messages-send --as user --user-id "<ou_xxx>" --msg-type interactive --content "$RAW"
# 群聊：改为 --as bot --chat-id "<oc_xxx>"
```

4. 确认后再去掉 `--dry-run` 实发。

## 与 Card Builder 模版（`type: template`）的关系

- 本 `meeting_minutes_card.schema2.json` 为**完整 JSON 卡片**，不是 `ctp_` 模版 ID 方案。
- 若改用 Card Builder 变量卡片，见 [`templates/card_binding.example.json`](templates/card_binding.example.json) 并拼 `{"type":"template","data":{...}}`。

## 参考

- [`../../../skills/lark-im/references/lark-im-messages-send.md`](../../../skills/lark-im/references/lark-im-messages-send.md)
- [`../../../skills/lark-openapi-explorer/SKILL.md`](../../../skills/lark-openapi-explorer/SKILL.md)
