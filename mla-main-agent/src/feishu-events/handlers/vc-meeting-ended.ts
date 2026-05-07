// VC meeting ended → triggerMain directly.
import type { FeishuWsEvent, TriggerPayload } from "../types";
import { triggerMain } from "../../openclaw/trigger-main.js";

export async function handleVcMeetingEnded(raw: FeishuWsEvent): Promise<void> {
  const m = raw.meeting ?? {};
  const meetingId = m.id ?? "";
  const startTime = m.start_time ?? "";
  const endTime = m.end_time ?? "";
  const calendarEventId = m.calendar_event_id ?? "";
  const topic = (m.topic ?? "").trim() || "(无主题)";
  const endSec = parseInt(endTime, 10);

  if (!endTime) return;

  const payload: TriggerPayload = {
    record: {
      timestamp: endSec,
      event_id: meetingId,
      summary: topic,
      action: "spawn_post_agent",
    },
    dedupe_key: `vc:${meetingId}:${endTime}:${raw.event_id}`,
    start_time: startTime,
    end_time: endTime,
    vchat_url: "",
    calendar_event_id: calendarEventId,
    vc_meeting_id: meetingId,
    actual_end: endTime,
  };

  await triggerMain(payload);
}
