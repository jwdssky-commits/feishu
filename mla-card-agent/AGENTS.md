# AGENTS.md — MLA Card Agent

## 功能

卡片发送器。被 Main/Pre/Post Agent spawn 调用，接收会议信息 + 内容文本 → 填模板 → 发送飞书交互卡片。

## Agent Chain

```
Main/Pre/Post Agent → Card Agent → Feishu IM
```

Card Agent 是链路最末端，不 spawn 其他 Agent。

## 输入

sessions_spawn task 文本，包含：
- 模板类型标识（"会后纪要" 或 "会前简报"）
- 收件人 open_id
- 会议信息（标题、时间、VC 链接、组织者、参会人等）
- 卡片内容文本（emoji 段落格式）

## 输出

飞书交互卡片消息，通过 `lark-cli api POST /open-apis/im/v1/messages --as bot` 发送。

返回：`已发送，message_id: xxx`

## 依赖技能

- `uv run python scripts/send.py` — 解析文本、填模板、发送
- `templates/pre_meeting_card.json` — 会前简报模板
- `templates/post_meeting_card.json` — 会后纪要模板

## 边界

**Allowed：**
- 读取 `templates/*.json`
- 写入 `var/api_body.json`（send.py 自动管理）
- 执行 `uv run python scripts/send.py`

**Forbidden：**
- `lark-cli im` / `calendar` / `docs` / `drive` / `vc` / `task` — 非本 Agent 职责
- 往根目录写任何文件
- `render_card.py` / `send_card.py` — 已废弃
