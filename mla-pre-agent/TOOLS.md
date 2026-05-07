# TOOLS.md — MLA Pre Agent

## CLI 接口

### calendar +agenda（补全会议信息）

```bash
lark-cli calendar +agenda --start "<会议日期>" --end "<会议日期+1天>" --as user --format json
# 用 event_id 匹配，提取 app_link、organizer、description、vchat
```

### drive +search（文档搜索）

```bash
lark-cli drive +search --query "<关键词>" --doc-types "docx,wiki" --sort edit_time --page-size 10 --as user --format json
# ⚠ query 最大 30 字符！超长报 99992402。拆分多 query，不用 OR 连接词
```

### docs +fetch（读文档大纲）

```bash
lark-cli docs +fetch --api-version v2 --doc "<token或url>" --scope outline --max-depth 2 --as user --format json
```

### docs +fetch（关键词精读）

```bash
lark-cli docs +fetch --api-version v2 --doc "<token或url>" --scope keyword --keyword "关键词1|关键词2" --context-before 1 --context-after 2 --as user --format json
```

### vc +search（历史会议）

```bash
lark-cli vc +search --query "<关键词>" --start "<30天前>" --end "<会议日期>" --page-size 10 --as user --format json
```

### vc +notes（历史会议纪要）

```bash
lark-cli vc +notes --meeting-ids "<id>" --as user --format json
```

### contact +get-user（解析参会人）

```bash
lark-cli contact +get-user --user-id "<open_id>" --as user --format json
# 返回 data.user.name + data.user.open_id
```

### sessions_spawn Card Agent

```json
{"agentId":"mla-card-agent","runtime":"subagent","context":"isolated","mode":"run","cleanup":"keep","runTimeoutSeconds":180,"task":"<task文本>"}
```

## 禁止

- `lark-cli calendar` — Main Agent 的事
- `lark-cli task` — Post Agent 的事
- `lark-cli im` — Card Agent 的事
- `lark-cli drive metas batch_query` — 不稳定，用 `docs +fetch` 代替
