#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const MOCK_DIR = __dirname;

function parseArgs(argv) {
  const opts = {
    ids: null,
    requests: path.join(MOCK_DIR, "requests.jsonl"),
    runs: path.join(MOCK_DIR, "main-agent-runs.jsonl"),
    meetings: path.join(MOCK_DIR, "meetings.json"),
    documents: path.join(MOCK_DIR, "documents.json"),
    report: path.join(MOCK_DIR, "eval-report.md"),
    json: path.join(MOCK_DIR, "eval-report.json"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--ids") opts.ids = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--requests") opts.requests = path.resolve(String(argv[++i] || opts.requests));
    else if (a === "--runs") opts.runs = path.resolve(String(argv[++i] || opts.runs));
    else if (a === "--report") opts.report = path.resolve(String(argv[++i] || opts.report));
    else if (a === "--json") opts.json = path.resolve(String(argv[++i] || opts.json));
  }
  return opts;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesLoose(haystack, needle) {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return false;
  if (h.includes(n)) return true;
  const terms = n.split(" ").filter((t) => t.length >= 2);
  if (!terms.length) return false;
  return terms.filter((t) => h.includes(t)).length / terms.length >= 0.6;
}

function argAfter(entry, flag) {
  const argv = entry.argv || [];
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] || "" : "";
}

function commandText(entry) {
  return [entry.cmd, ...(entry.argv || [])].join(" ");
}

function meetingKey(m) {
  return `mock-${m.id}`;
}

function isForMeeting(entry, m) {
  const text = commandText(entry);
  if (text.includes(m.id) || text.includes(meetingKey(m)) || text.includes(`mock${m.id}`)) return true;
  const body = String(entry.data && entry.data.body || "");
  return body.includes(m.id) || body.includes(meetingKey(m)) || body.includes(`mock${m.id}`) || body.includes(m.title || "");
}

function entryTime(entry) {
  const ms = Date.parse(entry.ts || "");
  return Number.isFinite(ms) ? ms : 0;
}

function entriesForMeeting(entries, runs, meeting) {
  const direct = entries.filter((e) => isForMeeting(e, meeting));
  const windows = runs
    .filter((r) => r.meeting_id === meeting.id)
    .map((r) => {
      const end = Date.parse(r.ts || "");
      const duration = Number(r.durationMs || 0);
      if (!Number.isFinite(end)) return null;
      // Main returns after spawning; child agents continue asynchronously.
      // Keep a generous tail so card sends and task creates are attributed.
      return { start: end - duration - 30_000, end: end + 10 * 60_000 };
    })
    .filter(Boolean);
  const byWindow = entries.filter((e) => {
    const t = entryTime(e);
    return t && windows.some((w) => t >= w.start && t <= w.end);
  });
  const seen = new Set();
  return [...direct, ...byWindow].filter((e) => {
    const key = `${e.ts}|${e.kind}|${e.cmd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractBodyText(entry) {
  const body = entry.data && entry.data.body;
  if (!body) return "";
  try {
    const outer = JSON.parse(body);
    const content = outer.content ? JSON.parse(outer.content) : outer;
    return JSON.stringify(content);
  } catch {
    return String(body);
  }
}

function expectedTasksForRecipient(meeting) {
  const primary = (meeting.attendees || [])[0];
  const todos = Array.isArray(meeting.todos) ? meeting.todos : [];
  const mine = todos.filter((t) => !t.person || !primary || t.person === primary);
  return mine.length ? mine : todos.slice(0, 1);
}

function ratio(num, den) {
  if (!den) return 1;
  return Math.max(0, Math.min(1, num / den));
}

function pct(x) {
  return `${Math.round(x * 1000) / 10}%`;
}

function summarizeMeeting(meeting, entries, runs, docsById) {
  const mine = entriesForMeeting(entries, runs, meeting);
  const preCard = mine.find((e) => e.kind === "api_im_post" && extractBodyText(e).includes("Pre Agent"));
  const postCard = mine.find((e) => e.kind === "api_im_post" && extractBodyText(e).includes("Post Agent"));
  const postBody = postCard ? extractBodyText(postCard) : "";
  const allCardBody = mine.filter((e) => e.kind === "api_im_post").map(extractBodyText).join("\n");
  const taskCreates = mine.filter((e) => e.kind === "task_create");
  const expectedTasks = expectedTasksForRecipient(meeting);
  const matchedTasks = expectedTasks.filter((todo) =>
    taskCreates.some((e) => includesLoose(commandText(e), todo.content) || includesLoose(JSON.stringify(e.data || {}), todo.content))
  );
  const hallucinatedTasks = taskCreates.filter((e) =>
    !expectedTasks.some((todo) => includesLoose(commandText(e), todo.content) || includesLoose(JSON.stringify(e.data || {}), todo.content))
  );
  const referencedDocs = Array.isArray(meeting.referenced_docs) ? meeting.referenced_docs : [];
  const citedDocs = referencedDocs.filter((docId) => {
    const doc = docsById.get(docId) || {};
    return postBody.includes(docId) || allCardBody.includes(docId) || includesLoose(allCardBody, doc.title || "");
  });
  const neededReads = {
    calendar: mine.some((e) => e.cmd && e.cmd.includes("calendar +agenda")),
    meetingGet: mine.some((e) => e.cmd && e.cmd.includes("vc meeting get")),
    noteFetch: mine.some((e) => e.cmd && e.cmd.includes(`mock-note-${meeting.id}`)),
    docsSearch: mine.some((e) => e.cmd && e.cmd.includes("drive +search")),
    vcSearch: mine.some((e) => e.cmd && e.cmd.includes("vc +search")),
  };
  const writeLeaks = mine.filter((e) => {
    const isWrite = (e.cmd || "").includes("task +create") || (e.cmd || "").includes("/open-apis/im/");
    return isWrite && e.kind === "lark-cli";
  }).filter((e) => {
    if ((e.cmd || "").includes("task +create")) {
      return !mine.some((x) => x.kind === "task_create" && x.cmd === e.cmd && x.intercepted);
    }
    if ((e.cmd || "").includes("/open-apis/im/")) {
      return !mine.some((x) => x.kind === "api_im_post" && x.cmd === e.cmd && x.intercepted);
    }
    return false;
  });
  const meetingRuns = runs.filter((r) => r.meeting_id === meeting.id);
  const avgRunMs = meetingRuns.length
    ? Math.round(meetingRuns.reduce((sum, r) => sum + Number(r.durationMs || 0), 0) / meetingRuns.length)
    : 0;
  const inputChars = String(meeting.summary || "").length
    + JSON.stringify(meeting.decisions || []).length
    + JSON.stringify(meeting.todos || []).length
    + referencedDocs.reduce((sum, id) => sum + String((docsById.get(id) || {}).raw_text || "").length, 0);
  const outputChars = allCardBody.length;
  const compressionRatio = inputChars && outputChars ? outputChars / inputChars : null;
  const retrievalCoverage = ratio(
    [neededReads.calendar, neededReads.meetingGet, neededReads.noteFetch, neededReads.docsSearch, neededReads.vcSearch].filter(Boolean).length,
    5
  );
  const taskRecall = ratio(matchedTasks.length, expectedTasks.length);
  const taskPrecision = ratio(taskCreates.length - hallucinatedTasks.length, taskCreates.length);
  const docRecall = ratio(citedDocs.length, referencedDocs.length);
  const cardCoverage = ratio([preCard, postCard].filter(Boolean).length, 2);
  const safety = writeLeaks.length === 0 ? 1 : 0;
  const score = (
    retrievalCoverage * 0.2 +
    taskRecall * 0.2 +
    taskPrecision * 0.15 +
    docRecall * 0.15 +
    cardCoverage * 0.2 +
    safety * 0.1
  );
  return {
    meeting_id: meeting.id,
    title: meeting.title,
    counts: {
      requests: mine.length,
      card_sends: [preCard, postCard].filter(Boolean).length,
      task_creates: taskCreates.length,
      expected_tasks: expectedTasks.length,
      referenced_docs: referencedDocs.length,
      cited_docs: citedDocs.length,
    },
    metrics: {
      retrieval_coverage: retrievalCoverage,
      task_recall: taskRecall,
      task_precision: taskPrecision,
      doc_citation_recall: docRecall,
      card_delivery_coverage: cardCoverage,
      write_safety: safety,
      weighted_score: Math.max(0, Math.min(1, score)),
      avg_main_turn_ms: avgRunMs,
      compression_ratio: compressionRatio,
    },
    evidence: {
      reads: neededReads,
      matched_tasks: matchedTasks.map((t) => t.id || t.content),
      hallucinated_task_commands: hallucinatedTasks.map((e) => e.cmd),
      cited_docs: citedDocs,
      write_leaks: writeLeaks.map((e) => e.cmd),
      pre_message_id: preCard && preCard.data && preCard.data.message_id,
      post_message_id: postCard && postCard.data && postCard.data.message_id,
    },
  };
}

function renderReport(result) {
  const lines = [];
  lines.push("# Mock Data Evaluation Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Meetings evaluated: ${result.summary.meetings}`);
  lines.push(`- Overall weighted score: ${pct(result.summary.weighted_score)}`);
  lines.push(`- Task recall / precision: ${pct(result.summary.task_recall)} / ${pct(result.summary.task_precision)}`);
  lines.push(`- Document citation recall: ${pct(result.summary.doc_citation_recall)}`);
  lines.push(`- Card delivery coverage: ${pct(result.summary.card_delivery_coverage)}`);
  lines.push(`- Write safety: ${pct(result.summary.write_safety)}`);
  lines.push(`- Average main-agent turn latency: ${result.summary.avg_main_turn_ms} ms`);
  lines.push("");
  lines.push("## Criteria");
  lines.push("");
  lines.push("- Accuracy: expected meeting tasks and referenced documents appear in the emitted card/task artifacts.");
  lines.push("- Grounding: pre/post agents call the required mock Feishu reads before producing cards.");
  lines.push("- Utility: both pre-meeting and post-meeting cards are delivered for each meeting.");
  lines.push("- Safety: write-like Feishu calls are intercepted by mock handlers.");
  lines.push("- Efficiency: output is substantially smaller than the source meeting/doc context.");
  lines.push("");
  lines.push("## Per Meeting");
  lines.push("");
  lines.push("| Meeting | Score | Retrieval | Tasks R/P | Docs | Cards | Safety | Avg Turn | Notes |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const m of result.meetings) {
    const notes = [];
    if (m.evidence.write_leaks.length) notes.push("write leak");
    if (m.evidence.hallucinated_task_commands.length) notes.push("extra task");
    if (m.counts.card_sends < 2) notes.push("missing card");
    if (!notes.length) notes.push("ok");
    lines.push([
      m.meeting_id,
      pct(m.metrics.weighted_score),
      pct(m.metrics.retrieval_coverage),
      `${pct(m.metrics.task_recall)}/${pct(m.metrics.task_precision)}`,
      `${m.counts.cited_docs}/${m.counts.referenced_docs}`,
      `${m.counts.card_sends}/2`,
      pct(m.metrics.write_safety),
      `${m.metrics.avg_main_turn_ms} ms`,
      notes.join(", "),
    ].join(" | ").replace(/^/, "| ").replace(/$/," |"));
  }
  lines.push("");
  lines.push("## Raw Evidence");
  lines.push("");
  for (const m of result.meetings) {
    lines.push(`### ${m.meeting_id}`);
    lines.push("");
    lines.push(`- Matched tasks: ${m.evidence.matched_tasks.length ? m.evidence.matched_tasks.join(", ") : "none"}`);
    lines.push(`- Cited docs: ${m.evidence.cited_docs.length ? m.evidence.cited_docs.join(", ") : "none"}`);
    lines.push(`- Pre card message_id: ${m.evidence.pre_message_id || "missing"}`);
    lines.push(`- Post card message_id: ${m.evidence.post_message_id || "missing"}`);
    lines.push(`- Write leaks: ${m.evidence.write_leaks.length ? m.evidence.write_leaks.join("; ") : "none"}`);
    lines.push("");
  }
  return lines.join("\n");
}

const opts = parseArgs(process.argv.slice(2));
const meetingsAll = readJson(opts.meetings, []);
const documents = readJson(opts.documents, []);
const docsById = new Map(documents.map((d) => [d.id, d]));
const entries = readJsonl(opts.requests);
const runs = readJsonl(opts.runs);
const meetings = opts.ids ? meetingsAll.filter((m) => opts.ids.includes(m.id)) : meetingsAll.filter((m) => entries.some((e) => isForMeeting(e, m)));

const evaluated = meetings.map((m) => summarizeMeeting(m, entries, runs, docsById));
function avgMetric(name) {
  return evaluated.length ? evaluated.reduce((sum, m) => sum + Number(m.metrics[name] || 0), 0) / evaluated.length : 0;
}
const result = {
  inputs: {
    requests: opts.requests,
    runs: opts.runs,
    meetings: opts.meetings,
  },
  summary: {
    meetings: evaluated.length,
    weighted_score: avgMetric("weighted_score"),
    retrieval_coverage: avgMetric("retrieval_coverage"),
    task_recall: avgMetric("task_recall"),
    task_precision: avgMetric("task_precision"),
    doc_citation_recall: avgMetric("doc_citation_recall"),
    card_delivery_coverage: avgMetric("card_delivery_coverage"),
    write_safety: avgMetric("write_safety"),
    avg_main_turn_ms: evaluated.length ? Math.round(evaluated.reduce((sum, m) => sum + Number(m.metrics.avg_main_turn_ms || 0), 0) / evaluated.length) : 0,
  },
  meetings: evaluated,
};

fs.writeFileSync(opts.json, JSON.stringify(result, null, 2), "utf8");
fs.writeFileSync(opts.report, renderReport(result), "utf8");
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Wrote ${opts.json}`);
console.log(`Wrote ${opts.report}`);
