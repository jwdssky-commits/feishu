// Feishu WebSocket entry point.
// Handlers only write state (meetings.json / jobs.json).
// The scheduler/runner is the ONLY path to triggerMain.
import * as Lark from "@larksuiteoapi/node-sdk";
import "dotenv/config";
import { handleVcMeetingEnded } from "./handlers/vc-meeting-ended";

const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;
const encryptKey = process.env.FEISHU_ENCRYPT_KEY || undefined;

const wsClient = new Lark.WSClient({
  appId,
  appSecret,
  loggerLevel: Lark.LoggerLevel.info,
});

const eventDispatcher = new Lark.EventDispatcher({
  encryptKey,
}).register({
  "vc.meeting.all_meeting_ended_v1": async (data: any) => {
    console.log("[MLA][RAW][vc.meeting.all_meeting_ended_v1]");
    console.log(JSON.stringify(data, null, 2));
    await handleVcMeetingEnded(data);
  },
});

wsClient.start({
  eventDispatcher,
});

console.log("[mla-feishu-ws] WebSocket started");
