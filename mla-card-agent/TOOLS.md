# TOOLS.md — MLA Card Agent

## 依赖工具

### send.py

唯一执行工具。接收结构化参数 + emoji 文本，填模板 → 发送卡片。

**基础参数：**

```
--text <str>              # emoji 段落文本，换行用 \n
--template <str>          # pre_meeting | post_meeting
--open-id <str>           # 收件人 open_id（ou_ 开头）
--summary <str>           # 会议标题
--date <str>              # YYYY-MM-DD
--time-range <str>        # HH:MM - HH:MM
--organizer <str>         # 组织者
--meeting-id <str>        # 会议号
--duration <str>          # 时长（仅 post）
--participants <str>      # 参会人数
--meeting-url <str>       # 日历链接（仅 pre）
--expert-names <str>      # 专家姓名，顿号分隔（仅 pre）
--expert-ids <str>        # 专家 open_id，逗号分隔（仅 pre）
--expert-reasons <str>    # 推荐理由，分号分隔（仅 pre）
--meeting-minutes-url <str> # 妙记链接（仅 post）
```

**结构化参数（JSON 数组，Card Agent 从任务文本中解析并构造）：**

```
--doc-lines <JSON>        # [{"title":"x","url":"https://...","author":"xx","date":"YYYY-MM-DD"}]
--todo-lines <JSON>       # [{"task":"x","url":"https://...","deadline":"YYYY-MM-DD"}]（仅 post）
--history-lines <JSON>    # [{"text":"x","url":"https://..."}]（仅 post）
--conclusions-closed <str> # 🎯 段全文（仅 post）
```

**pre_meeting 命令模板：**

```bash
uv run python scripts/send.py \
  --text "<简报内容>" --template pre_meeting --open-id "<open_id>" \
  --summary "<标题>" --date "<YYYY-MM-DD>" --time-range "<HH:MM - HH:MM>" \
  --organizer "<组织者>" --meeting-id "<ID>" --participants "<人数>" \
  --meeting-url "<app_link>" --expert-names "<专家>" --expert-ids "<ou_xxx>" \
  --expert-reasons "<理由>" \
  --doc-lines '[{"title":"x","url":"https://...","author":"xx","date":"YYYY-MM-DD"}]'
```

**post_meeting 命令模板：**

```bash
uv run python scripts/send.py \
  --text "<纪要内容>" --template post_meeting --open-id "<open_id>" \
  --summary "<标题>" --date "<YYYY-MM-DD>" --time-range "<HH:MM - HH:MM>" \
  --organizer "<组织者>" --meeting-id "<ID>" --duration "<时长>" \
  --participants "<人数>" --meeting-minutes-url "<妙记链接>" \
  --conclusions-closed "<🎯段全文>" \
  --todo-lines '[{"task":"x","url":"https://...","deadline":"YYYY-MM-DD"}]' \
  --doc-lines '[{"title":"x","url":"https://...","author":"xx","date":"YYYY-MM-DD"}]' \
  --history-lines '[{"text":"x","url":"https://..."}]'
```

### 卡片模板

send.py 自动读取：
- `templates/pre_meeting_card.json`
- `templates/post_meeting_card.json`

### 临时文件

send.py 写入 `var/api_body.json`，发送后自动删除。
