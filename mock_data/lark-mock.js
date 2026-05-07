#!/usr/bin/env node
// Smart mock lark-cli proxy — uses meetings.json + documents.json datasets.
// Intercepts search/fetch/agenda, returns realistic filtered results.
// Falls through to real lark-cli for unsupported read-only commands.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MOCK_DIR = __dirname;
const REAL_LARK = "C:\\Data\\06_AppData\\nodejs\\npm_global\\lark-cli.real.cmd";

const args = process.argv.slice(2);
const cmd = args.join(" ");
const paramsIdx = args.indexOf("--params");
const paramsStr = paramsIdx >= 0 ? args[paramsIdx + 1] || "" : "";
const REQUEST_LOG = path.join(MOCK_DIR, "requests.jsonl");

function logRequest(kind, extra = {}) {
  const entry = {
    ts: new Date().toISOString(),
    kind,
    argv: args,
    cmd,
    params: paramsStr || undefined,
    ...extra,
  };
  fs.appendFileSync(REQUEST_LOG, JSON.stringify(entry) + "\n", "utf8");
}

logRequest("lark-cli");

// ── Load datasets ──
let MEETINGS = [], DOCUMENTS = [], TRANSCRIPTS = [];
function loadData() {
  try { MEETINGS = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, "meetings.json"), "utf8")); } catch {}
  try { DOCUMENTS = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, "documents.json"), "utf8")); } catch {}
  for (const f of ["transcripts_01.json","transcripts_02.json","transcripts_03.json","transcripts_04.json"]) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, f), "utf8"));
      if (Array.isArray(data)) TRANSCRIPTS.push(...data);
    } catch {}
  }
}
loadData();

function reply(json) { process.stdout.write(JSON.stringify(json)); process.exit(0); }

function mockOk(kind, data) {
  logRequest(kind, { intercepted: true, data });
  reply({ ok: true, identity: "mock", data, meta: { intercepted: true } });
}

// ── Helpers ──
function pick(obj, keys) { const r = {}; for (const k of keys) if (obj[k] !== undefined) r[k] = obj[k]; return r; }

/*
const PEOPLE = {
  "斯楷扬": { name: "斯楷扬", open_id: "ou_f486645bb1af56100ce1ebda3c9d8d49", avatar_url: "https://mock.feishu.local/avatar/sikaiyang.png" },
  "杨天智": { name: "杨天智", open_id: "ou_751758d34ce9f8c4f145f349e35095d5", avatar_url: "https://mock.feishu.local/avatar/yangtianzhi.png" },
  "朱泽奇": { name: "朱泽奇", open_id: "ou_8acb6ae79df455d45e27ed9633368ee6", avatar_url: "https://mock.feishu.local/avatar/zhuzeqi.png" },
  "张雨婷": { name: "张雨婷", open_id: "ou_a0f276e88b6367cca1c333b077860126", avatar_url: "https://mock.feishu.local/avatar/zhangyuting.png" },
};

const NAME_ALIASES = {
  "斯": "斯楷扬",
  "杨": "杨天智",
  "朱": "朱泽奇",
  "张": "张雨婷",
};

function displayName(raw) {
  const text = String(raw || "").trim();
  return NAME_ALIASES[text] || text || "杨天智";
}

*/
const PEOPLE = {
  "\u65af\u6977\u626c": { name: "\u65af\u6977\u626c", open_id: "ou_f486645bb1af56100ce1ebda3c9d8d49", avatar_url: "https://mock.feishu.local/avatar/sikaiyang.png" },
  "\u6768\u5929\u667a": { name: "\u6768\u5929\u667a", open_id: "ou_751758d34ce9f8c4f145f349e35095d5", avatar_url: "https://mock.feishu.local/avatar/yangtianzhi.png" },
  "\u6731\u6cfd\u5947": { name: "\u6731\u6cfd\u5947", open_id: "ou_8acb6ae79df455d45e27ed9633368ee6", avatar_url: "https://mock.feishu.local/avatar/zhuzeqi.png" },
  "\u5f20\u96e8\u5a77": { name: "\u5f20\u96e8\u5a77", open_id: "ou_a0f276e88b6367cca1c333b077860126", avatar_url: "https://mock.feishu.local/avatar/zhangyuting.png" },
};

const NAME_ALIASES = {
  "\u65af": "\u65af\u6977\u626c",
  "\u6768": "\u6768\u5929\u667a",
  "\u6731": "\u6731\u6cfd\u5947",
  "\u5f20": "\u5f20\u96e8\u5a77",
};

function displayName(raw) {
  const text = String(raw || "").trim();
  return NAME_ALIASES[text] || text || "\u6768\u5929\u667a";
}

function personFor(raw) {
  const name = displayName(raw);
  if (PEOPLE[name]) return PEOPLE[name];
  const slug = Buffer.from(name).toString("hex").slice(0, 24).padEnd(24, "0");
  return { name, open_id: `ou_mock_${slug}`, avatar_url: `https://mock.feishu.local/avatar/${slug}.png` };
}

function personByOpenId(openId) {
  return Object.values(PEOPLE).find(p => p.open_id === openId) || null;
}

function searchMeetings(query) {
  if (!query) return MEETINGS.slice(0, 5);
  const terms = query.toLowerCase().split(/\s+/);
  return MEETINGS.filter(m => terms.some(t => m.title.toLowerCase().includes(t) || (m.summary||"").toLowerCase().includes(t) || (m.tags||[]).some(tg => tg.toLowerCase().includes(t))));
}

function searchDocs(query) {
  if (!query) return DOCUMENTS.slice(0, 5);
  const terms = query.toLowerCase().split(/\s+/);
  return DOCUMENTS.filter(d => terms.some(t => d.title.toLowerCase().includes(t) || (d.summary||"").toLowerCase().includes(t) || (d.raw_text||"").toLowerCase().includes(t) || (d.tags||[]).some(tg => tg.toLowerCase().includes(t))));
}

// ── calendar +agenda ──
if (cmd.includes("calendar") && cmd.includes("+agenda")) {
  const startIdx = args.indexOf("--start"), endIdx = args.indexOf("--end");
  // Return meetings in date range (or all if no range parsed)
  const data = MEETINGS.map(m => {
    const organizer = personFor((m.attendees || [])[0]);
    return ({
    app_link: `https://applink.feishu.cn/client/calendar/event/detail?calendarId=7631478149625908434&key=mock-${m.id}&startTime=0`,
    attendee_ability: "can_invite_others", color: -1,
    description: m.summary || "",
    end_time: { datetime: `${m.date}T${(m.time||"10:00-10:30").split("-")[1]||"10:30"}:00+08:00`, timezone: "Asia/Shanghai" },
    event_id: `mock-${m.id}_0`,
    event_organizer: { display_name: (m.attendees||["杨"])[0]||"杨天智", user_id: "ou_751758d34ce9f8c4f145f349e35095d5" },
    event_organizer: { display_name: organizer.name, user_id: organizer.open_id },
    free_busy_status: "busy", is_exception: false,
    organizer_calendar_id: "feishu.cn_q8nIqARbJIpXHqtVK7ws4e@group.calendar.feishu.cn",
    self_rsvp_status: "accept",
    start_time: { datetime: `${m.date}T${(m.time||"10:00-10:30").split("-")[0]||"10:00"}:00+08:00`, timezone: "Asia/Shanghai" },
    summary: m.title,
    vchat: { meeting_url: `https://vc.feishu.cn/j/mock${m.id}`, vc_type: "vc" },
    visibility: "public"
  })});
  reply({ ok: true, identity: "user", data, meta: { count: data.length } });
  return;
}

// ── vc meeting get ──
if (cmd.includes("vc") && (cmd.includes("meeting get") || cmd.includes("meeting") && cmd.includes("get"))) {
  let meetingId = "";
  try { const p = JSON.parse(paramsStr); meetingId = p.meeting_id || ""; } catch {}
  const m = MEETINGS.find(x => `mock-${x.id}` === meetingId || x.id === meetingId) || MEETINGS[0];
  const host = personFor((m.attendees || [])[0]);
  const transcript = TRANSCRIPTS.find(t => t.meeting_id === m.id) || null;
  reply({
    ok: true, identity: "user",
    data: {
      meeting: {
        id: `mock-${m.id}`, topic: m.title,
        start_time: String(Math.floor(new Date(`${m.date}T${(m.time||"10:00").split("-")[0]}:00+08:00`).getTime()/1000)),
        end_time: String(Math.floor(new Date(`${m.date}T${(m.time||"10:00-10:30").split("-")[1]||"10:30"}:00+08:00`).getTime()/1000)),
        meeting_no: "mock"+m.id.replace("M",""),
        meeting_url: `https://vc.feishu.cn/j/mock${m.id}`,
        host_user: { id: { open_id: host.open_id }, name: host.name }
      },
      related_artifacts: {
        note_doc_token: `mock-note-${m.id}`,
        verbatim_doc_token: "",
        minute_token: `mock-minute-${m.id}`
      }
    }
  });
  return;
}

// ── vc +notes ──
if (cmd.includes("+notes")) {
  let meetingIds = "";
  try { const p = JSON.parse(paramsStr); meetingIds = p.meeting_ids || ""; } catch {}
  const ids = meetingIds.split(",").map(s => s.trim()).filter(Boolean);
  const notes = ids.length ? ids.map(id => {
    const mid = id.replace("mock-","");
    const m = MEETINGS.find(x => x.id === mid) || MEETINGS[0];
    return { meeting_id: id, note_doc_token: `mock-note-${m.id}`, note_doc_url: `https://jcneyh7qlo8i.feishu.cn/docx/mock-${m.id}` };
  }) : [{ meeting_id: "mock-M01", note_doc_token: "mock-note-M01", note_doc_url: "https://jcneyh7qlo8i.feishu.cn/docx/mock-M01" }];
  reply({ ok: true, identity: "user", data: { notes } });
  return;
}

// ── vc +search ──
if (cmd.includes("vc") && cmd.includes("+search")) {
  const qIdx = args.indexOf("--query"), query = qIdx >= 0 ? args[qIdx+1] : "";
  const results = searchMeetings(query).slice(0, 10);
  reply({
    ok: true, identity: "user",
    data: {
      has_more: false,
      items: results.map(m => {
        const organizer = personFor((m.attendees || [])[0]);
        return ({
        meeting: { id: `mock-${m.id}`, topic: m.title,
          start_time: String(Math.floor(new Date(`${m.date}T10:00:00+08:00`).getTime()/1000)),
          end_time: String(Math.floor(new Date(`${m.date}T10:30:00+08:00`).getTime()/1000)) },
        display_info: { topic: `${m.title} ${m.date}`, start_time: `${m.date}T10:00:00+08:00`, end_time: `${m.date}T10:30:00+08:00`, organizer_name: (m.attendees||["杨"])[0]||"杨天智" },
        display_info: { topic: `${m.title} ${m.date}`, start_time: `${m.date}T10:00:00+08:00`, end_time: `${m.date}T10:30:00+08:00`, organizer_name: organizer.name },
        organizer,
        meta_data: { app_link: `https://vc.feishu.cn/j/mock${m.id}` }
      })}),
      total: results.length
    }
  });
  return;
}

// ── docs +fetch ──
if (cmd.includes("docs") && cmd.includes("+fetch")) {
  const docIdx = args.indexOf("--doc"), docToken = docIdx >= 0 ? args[docIdx+1] : "";
  // Try to match document by token (id or title)
  let doc = DOCUMENTS.find(d => docToken.includes(d.id)) || DOCUMENTS.find(d => docToken.includes(d.title.slice(0,6)));
  if (!doc) {
    // Try meeting note
    const mid = docToken.replace("mock-note-","mock-").replace("mock-","");
    const m = MEETINGS.find(x => x.id === mid);
    if (m) {
      // Build a synthetic meeting notes doc
      const decisions = (m.decisions||[]).map(d => `- ${d.status === "closed" ? "✅" : "⏳"} ${d.content}${d.person ? ` → ${d.person}` : ""}${d.deadline ? ` 📅 ${d.deadline}` : ""}`).join("\n");
      const todos = (m.todos||[]).map(t => `- [ ] ${t.content}${t.person ? ` @${t.person}` : ""}${t.deadline ? ` (DDL: ${t.deadline})` : ""}`).join("\n");
      const attendees = (m.attendees||[]).map(a => a === "斯" ? "斯楷扬" : a === "杨" ? "杨天智" : a === "朱" ? "朱泽奇" : a).join("、");
      return reply({
        ok: true, identity: "user",
        data: {
          doc_id: `mock-note-${m.id}`,
          title: `${m.title} ${m.date}`,
          markdown: `# ${m.title}\n\n会议时间：${m.date} ${m.time||""}\n参会人：${attendees}\n\n## 会议结论\n${decisions}\n\n## 待办事项\n${todos}`,
          length: 2000
        }
      });
    }
    doc = DOCUMENTS[0]; // fallback
  }
  reply({
    ok: true, identity: "user",
    data: {
      doc_id: doc.id,
      title: doc.title,
      markdown: doc.raw_text || doc.summary || "",
      length: (doc.raw_text||"").length || 500
    }
  });
  return;
}

// ── drive +search ──
if (cmd.includes("drive") && cmd.includes("+search")) {
  const qIdx = args.indexOf("--query"), query = qIdx >= 0 ? args[qIdx+1] : "";
  const results = searchDocs(query).slice(0, 10);
  const items = results.map(d => {
    const p = personFor(d.author);
    return ({
    entity_type: d.tags && d.tags.includes("wiki") ? "WIKI" : "DOC",
    result_meta: {
      edit_user_id: "ou_751758d34ce9f8c4f145f349e35095d5",
      edit_user_name: d.author === "斯" ? "斯楷扬" : d.author === "杨" ? "杨天智" : d.author === "朱" ? "朱泽奇" : d.author,
      owner_id: "ou_751758d34ce9f8c4f145f349e35095d5",
      owner_name: d.author === "斯" ? "斯楷扬" : d.author === "杨" ? "杨天智" : d.author === "朱" ? "朱泽奇" : d.author,
      title_highlighted: d.title,
      update_time_iso: `${d.date}T10:00:00+08:00`,
      edit_user_id: p.open_id,
      edit_user_name: p.name,
      owner_id: p.open_id,
      owner_name: p.name,
      token: d.id,
      url: `https://jcneyh7qlo8i.feishu.cn/docx/${d.id}`
    }
  })});
  reply({
    ok: true, identity: "user",
    data: { has_more: false, results: items, total: items.length }
  });
  return;
}

// ── docs +search ──
if (cmd.includes("docs") && cmd.includes("+search")) {
  const qIdx = args.indexOf("--query"), query = qIdx >= 0 ? args[qIdx+1] : "";
  const results = searchDocs(query).slice(0, 15);
  const items = results.map(d => {
    const p = personFor(d.author);
    return ({
    entity_type: "DOC",
    result_meta: {
      edit_user_id: "ou_87e4335f64717d7dc1071b0d0de452d7",
      edit_user_name: "智能纪要助手",
      owner_id: "ou_751758d34ce9f8c4f145f349e35095d5",
      title_highlighted: d.title,
      edit_user_id: p.open_id,
      edit_user_name: p.name,
      owner_id: p.open_id,
      owner_name: p.name,
      token: d.id,
      url: `https://jcneyh7qlo8i.feishu.cn/docx/${d.id}`
    }
  })});
  reply({
    ok: true, identity: "user",
    data: { has_more: false, results: items, total: items.length }
  });
  return;
}

// ── contact +get-user ──
if (cmd.includes("contact") && (cmd.includes("+search-user") || cmd.includes("search-user"))) {
  const qIdx = args.indexOf("--query");
  const query = qIdx >= 0 ? args[qIdx + 1] || "" : "";
  const people = Object.values(PEOPLE).filter(p => !query || p.name.includes(query) || p.open_id === query);
  reply({
    ok: true,
    identity: "user",
    data: {
      items: people.map(p => ({ name: p.name, open_id: p.open_id, user_id: p.open_id, avatar_url: p.avatar_url })),
    },
  });
  return;
}

if (cmd.includes("contact") && cmd.includes("+get-user")) {
  const uidIdx = args.indexOf("--user-id");
  const uid = uidIdx >= 0 ? args[uidIdx + 1] : "";
  const user = personByOpenId(uid) || personFor(uid);
  reply({
    ok: true,
    identity: "user",
    data: {
      user: {
        avatar_url: user.avatar_url,
        name: user.name,
        open_id: user.open_id,
        union_id: `on_mock_${user.open_id.slice(-8)}`,
        user_id: user.open_id,
      },
    },
  });
  return;
}

if (cmd.includes("contact") && cmd.includes("+get-user")) {
  // Check if --user-id is passed
  const uidIdx = args.indexOf("--user-id");
  const uid = uidIdx >= 0 ? args[uidIdx+1] : "";
  const users = {
    "ou_751758d34ce9f8c4f145f349e35095d5": { name: "杨天智", open_id: "ou_751758d34ce9f8c4f145f349e35095d5" },
    "ou_f486645bb1af56100ce1ebda3c9d8d49": { name: "斯楷扬", open_id: "ou_f486645bb1af56100ce1ebda3c9d8d49" },
    "ou_8acb6ae79df455d45e27ed9633368ee6": { name: "朱泽奇", open_id: "ou_8acb6ae79df455d45e27ed9633368ee6" },
  };
  const u = users[uid] || users["ou_751758d34ce9f8c4f145f349e35095d5"];
  reply({
    ok: true, identity: "user",
    data: {
      user: {
        avatar_url: "https://s3-imfile.feishucdn.com/static-resource/v1/v3_00110_8985307b-a386-4bc5-b802-5c44cbda2ddg~?image_size=72x72",
        name: u.name, open_id: u.open_id,
        union_id: "on_bf0f153cbf68e1ddbca44948df5042c8",
        user_id: "956cg832"
      }
    }
  });
  return;
}

// ── auth status --verify ──
if (cmd.includes("auth status") && cmd.includes("--verify")) {
  reply({ ok: true, identity: "user", data: { user: { open_id: "ou_751758d34ce9f8c4f145f349e35095d5", name: "杨天智" } } });
  return;
}

// ── Safety intercepts: never send real IM/cards or create real tasks in mock mode ──
if (cmd.includes("im ")) {
  mockOk("im", {
    message_id: `mock-msg-${Date.now()}`,
    note: "Mocked IM/card send. No real Feishu message was sent.",
  });
  return;
}

if (cmd.includes("api POST") && cmd.includes("/open-apis/im/")) {
  let body = "";
  const dataIdx = args.indexOf("--data");
  const dataArg = dataIdx >= 0 ? args[dataIdx + 1] || "" : "";
  if (dataArg.startsWith("@")) {
    try { body = fs.readFileSync(path.resolve(process.cwd(), dataArg.slice(1)), "utf8"); } catch {}
  }
  logRequest("api_im_post_real", {
    intercepted: false,
    body: body || undefined,
    note: "Passing raw Feishu IM API send through to real lark-cli.",
  });
  const result = spawnSync(REAL_LARK, args, { stdio: "pipe", windowsHide: true, timeout: 30000 });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  process.exit(result.status || 0);
}

if (cmd.includes("task") && (cmd.includes("+create") || cmd.includes("create"))) {
  mockOk("task_create", {
    task_guid: `mock-task-${Date.now()}`,
    url: `https://mock.feishu.local/task/${Date.now()}`,
    note: "Mocked task creation. No real Feishu task was created.",
  });
  return;
}

// ── Fall through to real lark-cli for unsupported commands ──
const result = spawnSync(REAL_LARK, args, { stdio: "pipe", windowsHide: true, timeout: 30000 });
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status || 0);
