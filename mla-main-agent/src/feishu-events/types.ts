/** Raw WS event. */
export type FeishuWsEvent = {
  schema: string;
  event_id: string;
  event_type: string;
  create_time: string;
  token: string;
  app_id: string;
  tenant_key: string;
  [key: string]: any;
};

/** Log entry for events.jsonl */
export type EventRecord = {
  timestamp: number;
  event_id: string;
  summary: string;
  action: "spawn_pre_agent" | "spawn_post_agent";
};

/** What triggerMain needs */
export type TriggerPayload = {
  record: EventRecord;
  dedupe_key: string;
  start_time: string;
  end_time: string;
  vchat_url: string;
  calendar_event_id: string;
  vc_meeting_id?: string;
  actual_end?: string;
};
