# AGENTS.md — MLA Pre Agent

## 功能

会前简报代理。接收会议信息 → 搜索飞书文档 + 历史会议 → 生成简报文本 → spawn Card Agent 发送。

## Agent Chain

```
Main Agent → Pre Agent（搜索文档 + 历史会议） → spawn Card Agent → Feishu IM
```

## 输入

Main Agent 通过 sessions_spawn task 传入：
- summary、start_time、end_time、description
- vchat_url、app_link
- 收件人 open_id

## 输出

- spawn Card Agent 发送会前简报卡片（新模板：card_link + 历史结论卡片 + 文档卡片 + 推荐专家）
- Pre 自己不生成卡片 JSON、不发消息

## 依赖技能

- `lark-cli drive +search` — 搜索文档/知识库
- `lark-cli docs +fetch` — 读取文档
- `lark-cli vc +search` — 搜索历史会议
- `lark-cli vc +notes` — 获取历史会议纪要
- `lark-cli contact +get-user` — 解析参会人姓名 + open_id
- `sessions_spawn Card Agent` — 发送卡片

## 边界

**Allowed：**
- `lark-cli drive +search`
- `lark-cli docs +fetch`（outline / keyword）
- `lark-cli vc +search` / `vc +notes`
- `lark-cli calendar +agenda` — 补全会议信息
- `lark-cli contact +get-user`
- `sessions_spawn Card Agent`

**Forbidden：**
- `lark-cli im` — Card Agent 的事
- 生成卡片 JSON — Card Agent 的事
- `lark-cli calendar +create` / `+update` — 不改日历
- `lark-cli task` — Post Agent 的事
