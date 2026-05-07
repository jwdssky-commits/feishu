#!/usr/bin/env node
/**
 * stdin: lark-cli calendar +agenda JSON (ok + data[])
 * 将已结束且尚未入队的日程追加到 ended_events.jsonl，并更新 post_meeting_enqueued_event_ids.json
 */
const fs = require("fs");
const path = require("path");

const workspace =
  process.env.WORKSPACE_SCHEDULING || "/home/node/.openclaw/workspace-scheduling";
const enqueuedPath = path.join(workspace, "meetinglog/post_meeting_enqueued_event_ids.json");
const queuePath = path.join(workspace, "meetinglog/ended_events.jsonl");

function parseTime(t) {
  if (t == null) return null;
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const raw = fs.readFileSync(0, "utf8");
let agenda;
try {
  agenda = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`enqueue-ended-events: invalid JSON stdin: ${e.message}\n`);
  process.exit(1);
}

if (!agenda.ok || !Array.isArray(agenda.data)) {
  process.stdout.write("0");
  process.exit(0);
}

let enqueued = { event_ids: [] };
if (fs.existsSync(enqueuedPath)) {
  try {
    enqueued = JSON.parse(fs.readFileSync(enqueuedPath, "utf8"));
  } catch {
    enqueued = { event_ids: [] };
  }
}
const set = new Set(enqueued.event_ids || []);

const now = Date.now();
const lines = [];

for (const event of agenda.data) {
  const endTs = parseTime(event.end_time ?? event.end?.timestamp);
  if (endTs == null || endTs > now) continue;
  const id = event.event_id;
  if (!id || set.has(id)) continue;

  const payload = {
    event_id: id,
    title: event.title || event.summary || "Untitled",
    start_time: event.start_time ?? event.start?.timestamp ?? "unknown",
    end_time: event.end_time ?? event.end?.timestamp ?? "unknown",
    participant_count: (event.attendees || []).length,
    ended_discovered_at: new Date().toISOString(),
  };
  lines.push(JSON.stringify(payload));
  set.add(id);
}

if (lines.length > 0) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.appendFileSync(queuePath, `${lines.join("\n")}\n`);
  enqueued.event_ids = [...set];
  enqueued.last_updated = new Date().toISOString();
  fs.mkdirSync(path.dirname(enqueuedPath), { recursive: true });
  fs.writeFileSync(enqueuedPath, JSON.stringify(enqueued, null, 2));
}

process.stdout.write(String(lines.length));
