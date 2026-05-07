// triggerMain — called by scanner (pre_meeting) or vc handler (post_meeting).
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { TriggerPayload } from "../feishu-events/types.js";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const VAR = path.join(ROOT, "var");
const EVENTS_LOG = path.join(VAR, "events.jsonl");
const DEDUP_FILE = path.join(VAR, "last_scan.json");

type Ledger = Record<string, { dispatched: string[] }>;

async function loadLedger(): Promise<Ledger> {
  try {
    const raw = await fs.readFile(DEDUP_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return {};
    return typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

async function markSeen(ledger: Ledger, key: string, action: string): Promise<void> {
  ledger[key] = { dispatched: [action] };
  await fs.mkdir(VAR, { recursive: true });
  await fs.writeFile(DEDUP_FILE, JSON.stringify(ledger), "utf8");
}

let callQueue: Promise<void> = Promise.resolve();

export async function triggerMain(p: TriggerPayload) {
  const ledger = await loadLedger();
  if (p.dedupe_key in ledger) {
    console.log("[trigger-main] duplicate, skipped:", p.dedupe_key);
    return;
  }

  await fs.mkdir(VAR, { recursive: true });
  await fs.appendFile(EVENTS_LOG, JSON.stringify(p.record) + "\n", "utf8");
  await markSeen(ledger, p.dedupe_key, p.record.action);

  const agentId = process.env.OPENCLAW_AGENT_ID ?? "mla-main-agent";
  const cwd = process.env.OPENCLAW_CWD ?? process.cwd();
  const isPre = p.record.action === "spawn_pre_agent";

  const message = isPre
    ? `会前简报："${p.record.summary}"\n时间: ${p.start_time} - ${p.end_time}\nevent_id: ${p.calendar_event_id}\nVC链接: ${p.vchat_url}\n\n按 SOUL.md 执行 pre_meeting 流程。`
    : `会后纪要："${p.record.summary}"\n时间: ${p.start_time} - ${p.end_time}\nVC meeting_id: ${p.vc_meeting_id ?? ""}\n实际结束: ${p.actual_end ?? ""}\nevent_id: ${p.calendar_event_id}\n\n按 SOUL.md 执行 post_meeting 流程。`;

  callQueue = callQueue.then(async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        path.join(cwd, "scripts", "run-node.mjs"),
        "agent", "--agent", agentId,
        "--message", message,
        "--json", "--timeout", "120",
      ],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 10, cwd }
    );

    if (stderr?.trim()) console.error("[openclaw stderr]", stderr.slice(0, 500));
    console.log("[openclaw stdout]", stdout.slice(0, 500));
  });

  await callQueue;
}
