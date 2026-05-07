#!/usr/bin/env node
/**
 * 输出一行 JSON delivery：供 scheduling 阶段 B/C 构造 sessions_spawn task。
 * 优先级：meetinglog/delivery_override.json（若含 target_user_open_id 或 target_chat_id）
 *        → lark-cli contact +get-user --as user（当前登录用户 open_id）
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const workspace = path.resolve(__dirname, "..");
const overridePath = path.join(workspace, "meetinglog", "delivery_override.json");

function loadOverride() {
  if (!fs.existsSync(overridePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(overridePath, "utf8"));
  } catch {
    return null;
  }
}

function emitDelivery(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const override = loadOverride();
if (override && (override.target_user_open_id || override.target_chat_id)) {
  emitDelivery({
    target_user_open_id: override.target_user_open_id ?? null,
    target_chat_id: override.target_chat_id ?? null,
    send_as:
      override.send_as ?? (override.target_chat_id && !override.target_user_open_id ? "bot" : "user"),
  });
  process.exit(0);
}

let raw;
try {
  raw = execFileSync("lark-cli", ["contact", "+get-user", "--as", "user", "--format", "json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (e) {
  process.stderr.write(
    `resolve-delivery: lark-cli contact +get-user failed: ${e.message}\n` +
      "提示：需已完成用户授权，且具备通讯录/自建应用对应 scope；见 workspace-scheduling/TOOLS.md\n",
  );
  process.exit(1);
}

let d;
try {
  d = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`resolve-delivery: invalid JSON from lark-cli: ${e.message}\n`);
  process.exit(1);
}

if (!d.ok) {
  process.stderr.write(`resolve-delivery: ${JSON.stringify(d)}\n`);
  process.exit(1);
}

const user = d.data?.user ?? d.data;
const openId = user?.open_id ?? user?.openId ?? d.data?.open_id;

if (!openId || typeof openId !== "string") {
  process.stderr.write(
    `resolve-delivery: 无法在 get-user 响应中解析 open_id，请检查 CLI 输出结构或改用 delivery_override.json\nraw: ${raw.slice(0, 800)}\n`,
  );
  process.exit(1);
}

emitDelivery({
  target_user_open_id: openId,
  target_chat_id: null,
  send_as: "user",
});
