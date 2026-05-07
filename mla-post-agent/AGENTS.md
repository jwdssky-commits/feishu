# AGENTS.md — MLA Post Agent

## 功能

会后纪要代理。接收会议基本信息 → 检索 VC 纪要 + 逐字稿 + 相关文档 + 历史决议 + 风险信号 → 提取待办并创建飞书任务（只给自己） → spawn Card Agent 发送。

## Agent Chain

```
Main Agent → Post Agent（检索 VC + 文档 + 历史 + 风险 + 创建任务） → spawn Card Agent → Feishu IM
```

## 输入

Main Agent 通过 sessions_spawn task 传入：
- summary、start_time、end_time
- vchat_url、app_link
- 收件人 open_id（= ME）

## 输出

- spawn Card Agent 发送会后纪要卡片（新模板：已闭环/待跟进结论卡 + 相关文档 + 历史决议 + 风险卡点）
- 创建飞书待办任务（只给 ME）
- Post 自己不生成卡片 JSON、不发消息

## 依赖技能

- `lark-cli vc meeting get` — 获取会议详情（最快路径，含妙记链接）
- `lark-cli vc +search` / `vc +notes` / `vc +recording` — 搜索会议 + 获取纪要
- `lark-cli docs +fetch` — 读取纪要/逐字稿文档
- `lark-cli drive +search` — 搜索相关文档
- `lark-cli contact +get-user` — 解析参会人姓名
- `lark-cli task +create` — 创建待办任务
- `sessions_spawn Card Agent` — 发送卡片

## 边界

**Allowed：**
- `lark-cli vc meeting get` / `vc +search` / `vc +notes` / `vc +recording`
- `lark-cli docs +search` — 搜索纪要文档（VC 路径失败时降级）
- `lark-cli docs +fetch --scope full`
- `lark-cli drive +search` — 搜索相关文档
- `lark-cli contact +get-user`
- `lark-cli task +create --assignee "<ME>"` — 只给自己
- `sessions_spawn Card Agent`

**Forbidden：**
- `lark-cli im` — Card Agent 的事
- 生成卡片 JSON — Card Agent 的事
- 给非 ME 创建任务
- `lark-cli calendar` — Main Agent 的事
