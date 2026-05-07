#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OPENCLAW_DIR = path.join(ROOT, "openclaw");
const MEETINGS_FILE = path.join(__dirname, "meetings.json");
const RUN_LOG = path.join(__dirname, "main-agent-runs.jsonl");

function parseArgs(argv) {
  const opts = { ids: null, phase: "both", timeout: 900 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--ids") opts.ids = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--phase") opts.phase = String(argv[++i] || "both");
    else if (a === "--timeout") opts.timeout = Number(argv[++i] || 900);
  }
  return opts;
}

function toIso(date, hhmm) {
  return `${date}T${hhmm}:00+08:00`;
}

function meetingTimes(m) {
  const [start = "10:00", end = "10:30"] = String(m.time || "").split("-");
  return { start: toIso(m.date, start), end: toIso(m.date, end) };
}

function actualEndSeconds(m) {
  const { end } = meetingTimes(m);
  const ms = Date.parse(end);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

function buildMessage(m, phase) {
  const { start, end } = meetingTimes(m);
  if (phase === "pre") {
    return [
      `会前简报：${m.title}`,
      `时间: ${start} - ${end}`,
      `event_id: mock-${m.id}_0`,
      `VC链接: https://vc.feishu.cn/j/mock${m.id}`,
      "",
      "按 SOUL.md 执行 pre_meeting 流程。",
    ].join("\n");
  }
  return [
    `会后纪要：${m.title}`,
    `时间: ${start} - ${end}`,
    `VC meeting_id: mock-${m.id}`,
    `实际结束: ${actualEndSeconds(m)}`,
    `event_id: mock-${m.id}_0`,
    "",
    "按 SOUL.md 执行 post_meeting 流程。",
  ].join("\n");
}

function appendLog(entry) {
  fs.appendFileSync(RUN_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8");
}

function runTurn(m, phase, timeout) {
  const message = buildMessage(m, phase);
  const args = [
    "scripts/run-node.mjs",
    "agent",
    "--agent",
    "mla-main-agent",
    "--message",
    message,
    "--json",
    "--timeout",
    String(timeout),
  ];
  console.log(`\n=== ${m.id} ${phase}: ${m.title} ===`);
  const started = Date.now();
  const res = spawnSync(process.execPath, args, {
    cwd: OPENCLAW_DIR,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      OPENCLAW_RUN_NODE_OUTPUT_LOG: path.join(__dirname, `openclaw-${m.id}-${phase}.log`),
    },
  });
  const durationMs = Date.now() - started;
  const entry = {
    meeting_id: m.id,
    phase,
    title: m.title,
    exitCode: res.status,
    durationMs,
    message,
    stdoutTail: (res.stdout || "").slice(-8000),
    stderrTail: (res.stderr || "").slice(-4000),
    error: res.error ? String(res.error.message || res.error) : undefined,
  };
  appendLog(entry);
  if (res.stdout) process.stdout.write(res.stdout.slice(-2000));
  if (res.stderr) process.stderr.write(res.stderr.slice(-2000));
  if (res.status !== 0) {
    console.error(`\n[failed] ${m.id} ${phase}, exit=${res.status}`);
  }
  return res.status === 0;
}

const opts = parseArgs(process.argv.slice(2));
const meetings = JSON.parse(fs.readFileSync(MEETINGS_FILE, "utf8"));
const selected = opts.ids ? meetings.filter((m) => opts.ids.includes(m.id)) : meetings;
const phases = opts.phase === "both" ? ["pre", "post"] : [opts.phase];

let ok = true;
for (const m of selected) {
  for (const phase of phases) {
    ok = runTurn(m, phase, opts.timeout) && ok;
  }
}
process.exit(ok ? 0 : 1);
