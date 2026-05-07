"""
Card Agent — structured card sender. Accepts both flat args and JSON arrays.
Usage:
  uv run python scripts/send.py \\
    --text "..." --template post_meeting --open-id ou_xxx \\
    --summary "标题" --date "2026-04-27" --time-range "21:15 - 21:46" \\
    --organizer "姓名" --meeting-id "302614221" --duration "31 分钟" --participants "3" \\
    --doc-lines '[{"title":"x","url":"https://...","author":"xx","date":"2026-04-30"}]' \\
    --todo-lines '[{"task":"x","url":"https://...","deadline":"2026-05-08"}]' \\
    --history-lines '[{"text":"决策","url":"https://..."}]'
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAR = os.path.join(ROOT, "var")
LARK = r"C:\Data\06_AppData\nodejs\npm_global\lark-cli.real.cmd"
if not os.path.exists(LARK):
    LARK = r"C:\Data\06_AppData\nodejs\npm_global\lark-cli.cmd"
if not os.path.exists(LARK):
    import shutil
    LARK = shutil.which("lark-cli") or "lark-cli"
os.makedirs(VAR, exist_ok=True)

EMOJI_MAP = {"🎯":"goal","📄":"background","📌":"history","⚠️":"risks","📋":"agenda","🔗":"links","✅":"todos","💬":"discussion","⏱":"duration"}


def parse_sections(text):
    sections, key, lines = {}, None, []
    for line in text.split("\n"):
        line = line.strip()
        if not line: continue
        matched = None
        for emoji, k in EMOJI_MAP.items():
            if line.startswith(emoji):
                if key and lines: sections[key] = "\n".join(lines)
                key, lines = k, []
                matched = True
                break
        if not matched and key: lines.append(line)
    if key and lines: sections[key] = "\n".join(lines)
    return sections


def replace(tmpl_str, k, v):
    return tmpl_str.replace(k, v.replace("\\","\\\\").replace('"','\\"').replace("\n","\\n"))


def make_column_row(left, right):
    """Build a column_set row: left (title) + right (meta, right-aligned)."""
    left_col = {"tag": "column", "width": "weighted", "weight": 3,
                "elements": [{"tag": "markdown", "content": left, "text_size": "normal"}]}
    if right:
        right_col = {"tag": "column", "width": "weighted", "weight": 2,
                     "padding": "0px 8px 0px 0px",
                     "elements": [{"tag": "markdown", "content": right, "text_align": "right", "text_size": "notation"}]}
        return {"tag": "column_set", "flex_mode": "stretch", "horizontal_spacing": "8px",
                "margin": "0px 0px 4px 0px", "columns": [left_col, right_col]}
    return {"tag": "column_set", "flex_mode": "stretch", "horizontal_spacing": "8px",
            "margin": "0px 0px 4px 0px", "columns": [left_col]}


def confidence_label(raw):
    try:
        score = float(raw)
    except (TypeError, ValueError):
        return ""
    return f"{score:.2f}"


def normalize_task_text(text):
    text = re.sub(r"https?://\S+", "", text or "")
    text = re.sub(r"confidence\s*=\s*\d+(?:\.\d+)?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bDDL\b|📅|自动执行|待审核|直接丢弃", "", text)
    text = re.sub(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", "", text)
    text = re.sub(r"[·\-\s—:：，,。；;（）()\[\]【】]+", "", text)
    return text.lower()


def extract_todo_meta_from_text(text):
    meta = {}
    for line in (text or "").split("\n"):
        raw = line.strip()
        if not raw:
            continue
        if "confidence" not in raw and "自动执行" not in raw and "待审核" not in raw:
            continue
        clean = raw.lstrip("·-0123456789️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣ ").strip()
        md_m = re.search(r"\[(.+?)\]\((\S+?)\)", clean)
        title = md_m.group(1) if md_m else clean
        title = re.split(r"\s+—\s+|\s+-\s+|\s+confidence\s*=", title, maxsplit=1)[0].strip()
        status_m = re.search(r"(自动执行|待审核|直接丢弃)", raw)
        conf_m = re.search(r"confidence\s*=\s*(\d+(?:\.\d+)?)", raw, re.IGNORECASE)
        ddl_m = re.search(r"(?:DDL|📅)\s*[:：]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})", raw, re.IGNORECASE)
        item = {}
        if status_m:
            item["status"] = status_m.group(1)
        if conf_m:
            item["confidence"] = conf_m.group(1)
        if ddl_m:
            item["deadline"] = ddl_m.group(1).replace("/", "-")
        key = normalize_task_text(title)
        if key and item:
            meta[key] = item
    return meta


def normalize_argv(argv):
    out = []
    i = 0
    while i < len(argv):
        if argv[i] == "--meeting-minutes-url" and (i + 1 >= len(argv) or argv[i + 1].startswith("--")):
            i += 1
            continue
        out.append(argv[i])
        i += 1
    return out


def parse_json_arg(raw, fallback):
    if not raw:
        return fallback
    candidates = [raw, raw.replace('\\"', '"')]
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # PowerShell sometimes strips JSON quotes from model-written commands:
    # [{task:foo,url:https://x,deadline:}] -> [{"task":"foo",...}]
    text = raw.strip()
    if not (text.startswith("[") and text.endswith("]")):
        return fallback
    items = []
    for body in re.findall(r"\{([^{}]*)\}", text):
        item = {}
        keys = ["title", "url", "author", "date", "task", "deadline", "confidence", "status", "evidence", "text", "id", "assignee"]
        for idx, key in enumerate(keys):
            marker = f"{key}:"
            start = body.find(marker)
            if start < 0:
                continue
            start += len(marker)
            next_positions = [body.find(f",{next_key}:", start) for next_key in keys if body.find(f",{next_key}:", start) >= 0]
            end = min(next_positions) if next_positions else len(body)
            item[key] = body[start:end].strip().strip('"').strip("'")
        if item:
            items.append(item)
    return items if items else fallback


def extract_embedded_todo_lines(text):
    marker = re.search(r"--TODO_LINES--\s*:?\s*(\[[\s\S]*?\])", text or "", re.IGNORECASE)
    if not marker:
        marker = re.search(r"--todo-lines\s*:?\s*(\[[\s\S]*?\])", text or "", re.IGNORECASE)
    if not marker:
        return []
    return parse_json_arg(marker.group(1), [])


def is_empty_card_value(value):
    text = (value or "").strip()
    if not text:
        return True
    compact = re.sub(r"[\s•·\-:：。]+", "", text)
    return compact in {
        "暂无",
        "无",
        "暂无历史会议结论",
        "暂无待跟进事项",
        "暂无风险提示",
        "暂无历史决议",
    }


def element_text(el):
    return json.dumps(el, ensure_ascii=False) if isinstance(el, dict) else str(el)


def remove_section(elements, heading_patterns):
    result = []
    skip_next = False
    for idx, el in enumerate(elements):
        if skip_next:
            skip_next = False
            continue
        text = element_text(el)
        if any(pattern in text for pattern in heading_patterns):
            skip_next = idx + 1 < len(elements)
            continue
        result.append(el)
    return result


def extract_doc_source_lines(text, section_text=""):
    lines = [l.strip().lstrip("·- ").strip() for l in (section_text or "").split("\n") if l.strip()]
    if lines:
        return lines
    result = []
    for raw in (text or "").split("\n"):
        line = raw.strip().lstrip("·- ").strip()
        if not line or "http" not in line:
            continue
        if re.search(r"\bby\b|·\s*by\s+|路\s*by\s+", line, re.IGNORECASE):
            result.append(line)
    return result


def main():
    global re
    p = argparse.ArgumentParser()
    p.add_argument("--text", required=True)
    p.add_argument("--template", required=True, choices=["pre_meeting", "post_meeting"])
    p.add_argument("--open-id", required=True)
    p.add_argument("--summary", default="")
    p.add_argument("--date", default="")
    p.add_argument("--time-range", default="")
    p.add_argument("--organizer", default="")
    p.add_argument("--meeting-id", default="")
    p.add_argument("--duration", default="")
    p.add_argument("--participants", default="")
    p.add_argument("--meeting-url", default="")
    p.add_argument("--expert-ids", default="")
    p.add_argument("--expert-names", default="")
    p.add_argument("--expert-reasons", default="")
    p.add_argument("--meeting-minutes-url", default="")
    # Structured JSON arrays (Card Agent constructs these from task text)
    p.add_argument("--doc-lines", default="")       # [{title, url, author, date}]
    p.add_argument("--todo-lines", default="")      # [{task, url, deadline}]
    p.add_argument("--history-lines", default="")   # [{text, url}]
    p.add_argument("--conclusions-closed", default="")
    p.add_argument("--action-items", default="")    # [{id, assignee, task}]
    args = p.parse_args(normalize_argv(sys.argv[1:]))

    text = args.text.replace("\\n", "\n")
    tpl_name = args.template
    open_id = args.open_id
    summary = args.summary
    date = args.date
    time_range = args.time_range
    organizer = args.organizer
    meeting_id = args.meeting_id
    duration = args.duration
    participants = args.participants

    with open(os.path.join(ROOT, "templates", f"{tpl_name}_card.json"), "r", encoding="utf-8") as f:
        template = json.load(f)

    sec = parse_sections(text)
    tmpl_str = json.dumps(template, ensure_ascii=False)

    # Parse structured JSON arrays
    doc_lines = parse_json_arg(args.doc_lines, [])
    todo_lines = parse_json_arg(args.todo_lines, [])
    if not todo_lines:
        todo_lines = extract_embedded_todo_lines(text)
    history_lines = parse_json_arg(args.history_lines, [])
    conclusions_closed = args.conclusions_closed or sec.get("goal", "暂无")
    action_items = parse_json_arg(args.action_items, [])
    text_todo_meta = extract_todo_meta_from_text(text)
    if todo_lines and text_todo_meta:
        for item in todo_lines:
            key = normalize_task_text(item.get("task", ""))
            extra = text_todo_meta.get(key)
            if not extra and key:
                extra = next((v for k, v in text_todo_meta.items() if key in k or k in key), None)
            if extra:
                for field in ("status", "confidence", "deadline"):
                    if extra.get(field) and not item.get(field):
                        item[field] = extra[field]
    action_count = len(todo_lines) if todo_lines else (len(action_items) if action_items else 0)

    if tpl_name == "pre_meeting":
        meeting_url = args.meeting_url or ""
        pcount = participants if participants.isdigit() else str(len([x for x in participants.replace("、","，").split("，") if x.strip()])) if participants else "0"

        history_text = sec.get("history", "")
        if "已闭环" in history_text and "待跟进" in history_text:
            parts_closed = history_text.split("待跟进")
            h_closed = parts_closed[0].replace("已闭环", "").strip().strip("：:").strip()
            h_pending = parts_closed[1].strip().strip("：:").strip() if len(parts_closed) > 1 else ""
        elif "已闭环" in history_text:
            h_closed = history_text.replace("已闭环", "").strip().strip("：:").strip()
            h_pending = "暂无"
        elif "待跟进" in history_text:
            h_closed = "暂无"
            h_pending = history_text.replace("待跟进", "").strip().strip("：:").strip()
        else:
            h_closed = history_text if history_text else "暂无历史会议结论"
            h_pending = "暂无待跟进事项"
        history_closed_present = not is_empty_card_value(h_closed)
        history_pending_present = not is_empty_card_value(h_pending)

        links_text = sec.get("links", "")
        link_urls = re.findall(r'https?://\S+', links_text)
        h_closed_url = link_urls[0] if len(link_urls) > 0 else meeting_url
        h_pending_url = link_urls[1] if len(link_urls) > 1 else (link_urls[0] if len(link_urls) > 0 else meeting_url)

        # Doc rows: from --doc-lines if provided, else fallback to text parsing
        doc_rows_list = []
        if doc_lines:
            for d in doc_lines:
                title = d.get("title", "")
                url = d.get("url", "")
                author = d.get("author", "")
                dd = d.get("date", "")
                left = f"▸ **[{title}]({url})**" if url else f"▸ **{title}**"
                meta_parts = []
                if author: meta_parts.append(f"by {author}")
                if dd: meta_parts.append(dd)
                right = f"*<font color='grey'>{' · '.join(meta_parts)}</font>*" if meta_parts else ""
                doc_rows_list.append(make_column_row(left, right))
        else:
            bg_lines = extract_doc_source_lines(text, sec.get("background", ""))
            for line in bg_lines:
                url = meeting_url
                url_m = re.search(r'\s+https?://\S+$', line)
                if url_m:
                    url = url_m.group().strip()
                    line = line[:url_m.start()].strip()
                author, dd = "", ""
                meta_m = re.search(r'·\s*by\s+(.+?)\s*·\s*(\S{2,10})', line)
                if meta_m:
                    author = meta_m.group(1).strip()
                    dd = meta_m.group(2).strip()
                    line = line[:meta_m.start()].strip()
                m = re.split(r'[：:]', line, maxsplit=1)
                title = m[0].strip()
                left = f"▸ **[{title}]({url})**" if url else f"▸ **{title}**"
                meta_parts = []
                if author: meta_parts.append(f"by {author}")
                if dd: meta_parts.append(dd)
                right = f"*<font color='grey'>{' · '.join(meta_parts)}</font>*" if meta_parts else ""
                doc_rows_list.append(make_column_row(left, right))
        docs_present = bool(doc_rows_list)
        if not doc_rows_list:
            doc_rows_list.append({"tag": "markdown", "content": "暂无"})
        doc_rows_json = json.dumps(doc_rows_list, ensure_ascii=False)

        expert_names = [x.strip() for x in re.split(r"[、，,]", args.expert_names or "") if x.strip()]
        expert_ids = [x.strip() for x in re.split(r"[,，]", args.expert_ids or "") if x.strip()]
        expert_reasons = [x.strip() for x in re.split(r"[；;]", args.expert_reasons or "") if x.strip()]
        experts = []
        expert_index = {}
        for i, name in enumerate(expert_names):
            eid = expert_ids[i] if i < len(expert_ids) else ""
            key = eid or name
            if not key:
                continue
            if key not in expert_index:
                expert_index[key] = len(experts)
                experts.append({"id": eid, "name": name, "reasons": []})
            expert = experts[expert_index[key]]
            reason = expert_reasons[i] if i < len(expert_reasons) else ""
            if reason and reason not in expert["reasons"]:
                expert["reasons"].append(reason)
        if experts:
            lines = []
            for expert in experts:
                reason = "；".join(expert["reasons"][:3])
                suffix = f" — {reason}" if reason else ""
                if expert["id"]:
                    lines.append(f"<person id='{expert['id']}' show_name=true show_avatar=true style='normal'></person>{suffix}")
                else:
                    lines.append(f"• {expert['name']}{suffix}")
            expert_rows = "\n".join(lines)
        else:
            expert_rows = "暂无"
        experts_present = bool(experts)

        raw_risk_items = sec.get("risks", "暂无风险提示")
        risk_present = not is_empty_card_value(raw_risk_items)
        risk_items = raw_risk_items
        risk_items = "\n".join([f"• {l.strip().lstrip('·- ').strip()}" for l in risk_items.split("\n") if l.strip()])

        repl = {
            "{{meeting_summary}}": summary,
            "{{meeting_date}}": date,
            "{{meeting_time_range}}": time_range,
            "{{meeting_url}}": meeting_url,
            "{{participant_count}}": pcount,
            "{{history_closed}}": h_closed,
            "{{history_closed_url}}": h_closed_url,
            "{{history_pending}}": h_pending,
            "{{history_pending_url}}": h_pending_url,
            "{{risk_items}}": risk_items,
            "{{expert_rows}}": expert_rows,
            "{{footer}}": "🤖 MLA Pre Agent · 数据来源：飞书文档搜索 + AI 总结",
        }
        for k, v in repl.items():
            tmpl_str = replace(tmpl_str, k, v)
        tmpl_str = tmpl_str.replace('"{{doc_rows}}"', doc_rows_json)
    else:
        pcount = participants if participants.isdigit() else str(len([x for x in participants.replace("、","，").split("，") if x.strip()])) if participants else "0"
        date_short = "/".join([d[-2:] for d in date.split("-")]) if date else ""
        import re
        link_urls = re.findall(r'https?://\S+', sec.get("links", ""))
        minutes_url = args.meeting_minutes_url or (link_urls[0] if link_urls else "")

        # Todo rows: from --todo-lines if provided, else fallback to text parsing
        todo_rows = []
        if todo_lines:
            for t in todo_lines:
                task = t.get("task", "")
                url = t.get("url", "")
                deadline = t.get("deadline", "")
                confidence = confidence_label(t.get("confidence", ""))
                status = t.get("status", "")
                left = f"**[{task}]({url})**" if url else f"**{task}**"
                meta_parts = []
                if deadline:
                    meta_parts.append(f"📅 {deadline}")
                if status:
                    meta_parts.append(status)
                if confidence:
                    meta_parts.append(confidence)
                right = f"<font color='grey'>{' · '.join(meta_parts)}</font>" if meta_parts else ""
                todo_rows.append(make_column_row(left, right))
        else:
            for l in sec.get("agenda", "").split("\n"):
                l = l.strip().lstrip("·- ").strip()
                if not l: continue
                md_m = re.match(r'\[(.+?)\]\((\S+?)\)', l)
                date_str = ""
                status = ""
                confidence = ""
                if md_m:
                    title = md_m.group(1)
                    url = md_m.group(2)
                    rest = l[md_m.end():].strip()
                    date_m = re.search(r'📅\s*(\S+)', rest)
                    if date_m: date_str = date_m.group(1)
                    status_m = re.search(r'(自动执行|待审核)', rest)
                    if status_m: status = status_m.group(1)
                    conf_m = re.search(r'(?<!\d)(0(?:\.\d+)?|1(?:\.0+)?)(?!\d)', rest)
                    if conf_m: confidence = confidence_label(conf_m.group(1))
                else:
                    title, url = l, ""
                    date_m = re.search(r'📅\s*(\S+)', l)
                    if date_m: date_str = date_m.group(1)
                    status_m = re.search(r'(自动执行|待审核)', l)
                    if status_m: status = status_m.group(1)
                    conf_m = re.search(r'(?<!\d)(0(?:\.\d+)?|1(?:\.0+)?)(?!\d)', l)
                    if conf_m: confidence = confidence_label(conf_m.group(1))
                left = f"**[{title}]({url})**" if url else f"**{title}**"
                meta_parts = []
                if date_str:
                    meta_parts.append(f"📅 {date_str}")
                if status:
                    meta_parts.append(status)
                if confidence:
                    meta_parts.append(confidence)
                right = f"<font color='grey'>{' · '.join(meta_parts)}</font>" if meta_parts else ""
                todo_rows.append(make_column_row(left, right))
        if not todo_rows:
            todo_rows.append({"tag": "markdown", "content": "暂无"})
        todo_rows_json = json.dumps(todo_rows, ensure_ascii=False)

        # Doc rows: from --doc-lines
        doc_rows_list = []
        if doc_lines:
            for d in doc_lines:
                title = d.get("title", "")
                url = d.get("url", "")
                author = d.get("author", "")
                dd = d.get("date", "")
                left = f"▸ **[{title}]({url})**" if url else f"▸ **{title}**"
                meta_parts = []
                if author: meta_parts.append(f"by {author}")
                if dd: meta_parts.append(dd)
                right = f"*<font color='grey'>{' · '.join(meta_parts)}</font>*" if meta_parts else ""
                doc_rows_list.append(make_column_row(left, right))
        else:
            bg_lines = extract_doc_source_lines(text, sec.get("background", ""))
            for line in bg_lines:
                url = ""
                url_m = re.search(r'\s+https?://\S+$', line)
                if url_m:
                    url = url_m.group().strip()
                    line = line[:url_m.start()].strip()
                author, dd = "", ""
                meta_m = re.search(r'·\s*by\s+(.+?)\s*·\s*(\S{2,10})', line)
                if meta_m:
                    author = meta_m.group(1).strip()
                    dd = meta_m.group(2).strip()
                    line = line[:meta_m.start()].strip()
                m = re.split(r'[：:]', line, maxsplit=1)
                title = m[0].strip()
                left = f"▸ **[{title}]({url})**" if url else f"▸ **{title}**"
                meta_parts = []
                if author: meta_parts.append(f"by {author}")
                if dd: meta_parts.append(dd)
                right = f"*<font color='grey'>{' · '.join(meta_parts)}</font>*" if meta_parts else ""
                doc_rows_list.append(make_column_row(left, right))
        if not doc_rows_list:
            doc_rows_list.append({"tag": "markdown", "content": "暂无"})
        doc_rows_json = json.dumps(doc_rows_list, ensure_ascii=False)

        # History: from --history-lines
        history_present = False
        if history_lines:
            history_decisions = "\n".join([f"- [{h['text']}]({h['url']})" for h in history_lines])
            history_present = True
        else:
            hist_lines = []
            for l in sec.get("history", "").split("\n"):
                l = l.strip().lstrip("·- ").strip()
                if not l: continue
                md_m = re.match(r'\[(.+?)\]\((\S+?)\)', l)
                if md_m:
                    hist_lines.append(f"- [{md_m.group(1)}]({md_m.group(2)})")
                else:
                    url = ""
                    url_m = re.search(r'\s+https?://\S+$', l)
                    if url_m:
                        url = url_m.group().strip()
                        l = l[:url_m.start()].strip()
                    hist_lines.append(f"- [{l}]({url})" if url else f"- {l}")
            history_decisions = "\n".join(hist_lines) if hist_lines else ""
            history_present = bool(hist_lines)

        repl = {
            "{{meeting_summary}}": summary,
            "{{meeting_date}}": date_short,
            "{{meeting_time_range}}": time_range,
            "{{participant_count}}": pcount,
            "{{meeting_minutes_url}}": minutes_url,
            "{{todo_count}}": str(action_count),
            "{{conclusions_closed}}": conclusions_closed,
            "{{history_decisions}}": history_decisions,
            "{{footer}}": f"🤖 MLA Post Agent · {action_count}项待办 · 数据来源：飞书会议转写 + AI 总结",
        }
        for k, v in repl.items():
            tmpl_str = replace(tmpl_str, k, v)

        tmpl_str = tmpl_str.replace('"{{todo_rows}}"', todo_rows_json)
        tmpl_str = tmpl_str.replace('"{{doc_rows}}"', doc_rows_json)

    action_items_rows = json.dumps(action_items, ensure_ascii=False)
    tmpl_str = tmpl_str.replace('"{{action_items_rows}}"', action_items_rows)

    card = json.loads(tmpl_str)
    if args.template == "pre_meeting":
        elements = card["body"]["elements"]

        if not locals().get("docs_present", True):
            elements = remove_section(elements, ["相关文档", "鐩稿叧鏂囨。"])
        if not locals().get("risk_present", True):
            elements = remove_section(elements, ["风险提示", "椋庨櫓鎻愮ず"])
        if not locals().get("experts_present", True):
            elements = remove_section(elements, ["推荐专家", "鎺ㄨ崘涓撳"])

        closed_present = locals().get("history_closed_present", True)
        pending_present = locals().get("history_pending_present", True)
        if not closed_present or not pending_present:
            for el in elements:
                if not isinstance(el, dict) or "columns" not in el:
                    continue
                text = element_text(el)
                if "已关闭事项" not in text and "待跟进事项" not in text and "宸插叧闂簨椤" not in text and "寰呰窡杩涗簨椤" not in text:
                    continue
                filtered = []
                for col in el.get("columns", []):
                    col_text = element_text(col)
                    if not closed_present and ("已关闭事项" in col_text or "宸插叧闂簨椤" in col_text):
                        continue
                    if not pending_present and ("待跟进事项" in col_text or "寰呰窡杩涗簨椤" in col_text):
                        continue
                    filtered.append(col)
                el["columns"] = filtered

        if not closed_present and not pending_present:
            elements = remove_section(elements, ["历史会议结论", "鍘嗗彶浼氳缁撹"])

        card["body"]["elements"] = elements
    if args.template == "post_meeting" and not locals().get("history_present", True):
        def is_history_block(el):
            if not isinstance(el, dict):
                return False
            text = json.dumps(el, ensure_ascii=False)
            return "相关历史决议" in text or "鐩稿叧鍘嗗彶鍐宠" in text
        card["body"]["elements"] = [el for el in card["body"]["elements"] if not is_history_block(el)]
    def flatten_els(els):
        result = []
        for el in els:
            if isinstance(el, list):
                result.extend(el)
            elif isinstance(el, dict):
                if "elements" in el: el["elements"] = flatten_els(el["elements"])
                if "columns" in el:
                    for col in el["columns"]:
                        if "elements" in col: col["elements"] = flatten_els(col["elements"])
                result.append(el)
            else:
                result.append(el)
        return result
    card["body"]["elements"] = flatten_els(card["body"]["elements"])
    card_compact = json.dumps(card, ensure_ascii=False, separators=(",", ":"))

    body = {"receive_id": open_id, "msg_type": "interactive", "content": card_compact}
    body_path = os.path.join(VAR, "api_body.json")
    with open(body_path, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)

    r = subprocess.run([
        LARK, "api", "POST", "/open-apis/im/v1/messages",
        "--params", '{"receive_id_type":"open_id"}',
        "--data", "@api_body.json", "--as", "bot",
    ], capture_output=True, encoding="utf-8", errors="replace", timeout=30, cwd=VAR)

    stdout_text = (r.stdout or "").strip()
    stderr_text = (r.stderr or "").strip()
    stdout = stdout_text or stderr_text
    try:
        resp = json.loads(stdout)
        msg_id = resp.get("data", {}).get("message_id", "?")
        ok = r.returncode == 0 and (resp.get("code") == 0 or resp.get("ok") is True)
    except json.JSONDecodeError:
        msg_id, ok = "?", False

    if ok:
        try:
            os.remove(body_path)
        except OSError:
            pass

    result = {"status": "sent" if ok else "error", "message_id": msg_id}
    if not ok:
        result["returncode"] = r.returncode
        result["stdout"] = stdout_text[:4000]
        result["stderr"] = stderr_text[:4000]
        result["body_path"] = body_path
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
