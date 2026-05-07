// Scanner — calls lark-cli calendar +agenda every 60s.
// Finds upcoming meetings (now → now+30min), triggers pre_meeting via triggerMain.
import "dotenv/config";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { triggerMain } from "../openclaw/trigger-main.js";
import type { TriggerPayload } from "../feishu-events/types.js";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const VAR = path.join(ROOT, "var");
const DEDUP_FILE = path.join(VAR, "last_scan.json");
const LARK = fsSync.existsSync("C:\\Data\\06_AppData\\nodejs\\npm_global\\lark-cli.cmd")
  ? "C:\\Data\\06_AppData\\nodejs\\npm_global\\lark-cli.cmd"
  : "lark-cli";

type Ledger = Record<string, { dispatched: string[] }>;

async function loadLedger(): Promise<Ledger> {
  try {
    const raw = await fs.readFile(DEDUP_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return {};
    return typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

async function markSeen(ledger: Ledger, key: string): Promise<void> {
  ledger[key] = { dispatched: ["pre_meeting"] };
  await fs.mkdir(VAR, { recursive: true });
  await fs.writeFile(DEDUP_FILE, JSON.stringify(ledger), "utf8");
}

const pad = (n: number) => String(n).padStart(2, "0");

function toGMT8(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
}

async function scan() {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 60 * 1000);
  const startIso = toGMT8(now);
  const endIso = toGMT8(end);

  const { stdout } = await execFileAsync(LARK, [
    "calendar", "+agenda",
    "--start", startIso,
    "--end", endIso,
    "--as", "user",
    "--format", "json",
  ], { windowsHide: true, maxBuffer: 1024 * 1024, shell: true });

  const result = JSON.parse(stdout);
  if (!result.ok || !result.data?.length) return;

  const ledger = await loadLedger();

  for (const ev of result.data) {
    const eventId = ev.event_id;
    const dedupeKey = `scan:${eventId}`;

    if (dedupeKey in ledger) continue;

    const startTime = ev.start_time?.datetime ?? "";
    const endTime = ev.end_time?.datetime ?? "";

    const payload: TriggerPayload = {
      record: {
        timestamp: Math.floor(Date.now() / 1000),
        event_id: eventId,
        summary: ev.summary ?? "",
        action: "spawn_pre_agent",
      },
      dedupe_key: dedupeKey,
      start_time: startTime,
      end_time: endTime,
      vchat_url: ev.vchat?.meeting_url ?? "",
      calendar_event_id: eventId,
    };

    console.log(`[scanner] pre_meeting: ${ev.summary} at ${startTime}`);
    await triggerMain(payload);
    await markSeen(ledger, dedupeKey);
  }
}

setInterval(() => {
  scan().catch((err) => console.error("[scanner] error:", String(err).slice(0, 200)));
}, 60_000);

scan();
console.log("[mla-scanner] started (60s interval, +30min window)");
