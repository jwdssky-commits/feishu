# TOOLS.md — MLA Post Agent

## CLI 接口

### docs +search（搜纪要文档，VC 路径失败时降级）

```bash
lark-cli docs +search --query "<标题关键词>" --as user --format json
# 匹配智能纪要助手生成的文档，提取 token → docs +fetch
```

### vc meeting get（最快路径）
```bash
lark-cli vc meeting get --params '{"meeting_id":"<id>","query_mode":1,"with_participants":true}' --as user --format json
# query_mode=1 返回 related_artifacts + 会议详情 + 妙记链接
```

### vc +search / +notes / +recording（降级路径）
```bash
lark-cli vc +search --query "<关键词>" --start "<日期>" --end "<次日>" --page-size 10 --as user --format json
lark-cli vc +notes --meeting-ids "<id>" --as user --format json
lark-cli vc +recording --meeting-ids "<id>" --as user --format json
lark-cli vc +notes --minute-tokens "<token>" --as user --format json
# --minute-tokens 返回 artifacts: chapters, summary, todos, transcript_file
```

### docs +fetch（读纪要）
```bash
lark-cli docs +fetch --api-version v2 --doc "<doc_token>" --scope full --as user --format json
# ⚠ 只用 --scope full
```

### drive +search（搜相关文档）
```bash
lark-cli drive +search --query "<关键词>" --doc-types "docx,wiki" --sort edit_time --page-size 5 --as user --format json
# 提取: token→拼URL, edit_user_name→作者, update_time_iso→日期
```

### contact +get-user
```bash
lark-cli contact +get-user --user-id "<open_id>" --as user --format json
# 返回 data.user.name
```

### task +create（创建待办）
```bash
lark-cli task +create \
  --summary "[会议待办] {内容}" \
  --description "来源：{会议标题}\n{妙记链接}" \
  --assignee "<ME>" \
  --due "<YYYY-MM-DD>" \
  --as user
# --due 可选：ISO 8601 / YYYY-MM-DD / +2d / ms timestamp
# 返回 data.url 即任务链接，用于卡片中可点击跳转
```

### sessions_spawn Card Agent
```json
{"agentId":"mla-card-agent","runtime":"subagent","context":"isolated","mode":"run","cleanup":"keep","runTimeoutSeconds":180,"task":"<task文本>"}
```

## 禁止

- `lark-cli docs +export` — 不支持
- `lark-cli docs +fetch --scope simple` — 报错
- `lark-cli im` — Card Agent 的事
- `lark-cli calendar` — Main Agent 的事
