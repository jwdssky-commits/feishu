#!/bin/bash
# 快照 diff + new_events.jsonl：与 scheduling「心跳仅遍历日历」分离。
# 建议由系统 cron 调用；OpenClaw cron 唤醒的 agent 不应在本仓库心跳里替代本脚本做对比。
# 发现新事件后，派发 pre-meeting 由单独任务（阶段 B）触发。
# 同一脚本末尾会扫描过去时间窗内「已结束」的日程，写入 ended_events.jsonl，由阶段 C 派发 post-meeting。

WORKSPACE="/home/node/.openclaw/workspace-scheduling"
SNAPSHOT_FILE="$WORKSPACE/meetinglog/history_event_ids.json"
CALENDAR_ID="feishu.cn_hPSfMZ4cqYRd4yFZeFWhOc@group.calendar.feishu.cn"
LOG_FILE="$WORKSPACE/meetinglog/poll.log"
ENQUEUE_ENDED_JS="$WORKSPACE/meetinglog/enqueue-ended-events.js"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG_FILE"
}

# 会后派发：拉取过去时间窗内日程，将「已结束且未入队」的事件写入 ended_events.jsonl（由阶段 C cron 消费）
scan_ended_meetings_for_post() {
    local PAST_START PAST_END PAST_RESPONSE COUNT
    PAST_START=$(date -u -d '-72 hours' +%Y-%m-%dT%H:%M:%SZ)
    PAST_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    log "Post-meeting scan: fetching agenda $PAST_START .. $PAST_END"
    PAST_RESPONSE=$(lark-cli calendar +agenda \
        --format json \
        --calendar-id "$CALENDAR_ID" \
        --start "$PAST_START" \
        --end "$PAST_END" 2>&1)
    OK_PAST=$(echo "$PAST_RESPONSE" | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.ok||'false')}catch(e){console.log('false')}" 2>/dev/null)
    if [ "$OK_PAST" != "true" ]; then
        log "WARN: post-meeting past-window agenda failed (skipped): ${PAST_RESPONSE:0:200}"
        return 0
    fi
    export WORKSPACE_SCHEDULING="$WORKSPACE"
    COUNT=$(echo "$PAST_RESPONSE" | node "$ENQUEUE_ENDED_JS" 2>/dev/null || echo "0")
    log "Post-meeting scan: enqueued $COUNT ended event(s) to ended_events.jsonl"
}

log "=== Poll started ==="

# Get current time window (now to +48 hours)
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
END_TIME=$(date -u -d '+48 hours' +%Y-%m-%dT%H:%M:%SZ)

# Fetch latest events from Lark Calendar using +agenda
log "Fetching events from calendar..."
EVENTS_RESPONSE=$(lark-cli calendar +agenda \
    --format json \
    --calendar-id "$CALENDAR_ID" \
    --start "$START_TIME" \
    --end "$END_TIME" 2>&1)

log "API response received"

# Check if response is valid using node
OK_STATUS=$(echo "$EVENTS_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.ok||'false')")
if [ "$OK_STATUS" != "true" ]; then
    log "ERROR: API call failed - $EVENTS_RESPONSE"
    scan_ended_meetings_for_post
    exit 0
fi

# Extract event IDs from response using node
LATEST_IDS=$(echo "$EVENTS_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); d.data.forEach(e=>console.log(e.event_id))" | sort -u)

log "Latest event IDs count: $(echo "$LATEST_IDS" | grep -c . || echo 0)"

# Read historical IDs
if [ -f "$SNAPSHOT_FILE" ]; then
    HISTORICAL_IDS=$(node -e "const d=JSON.parse(require('fs').readFileSync('$SNAPSHOT_FILE','utf8')); d.event_ids.forEach(id=>console.log(id))" 2>/dev/null | sort -u)
else
    HISTORICAL_IDS=""
fi

# Find new event IDs using node
NEW_IDS=$(node -e "
const latest = \`$LATEST_IDS\`.split('\n').filter(x=>x.trim());
const historical = \`$HISTORICAL_IDS\`.split('\n').filter(x=>x.trim());
const newIds = latest.filter(id => !historical.includes(id));
newIds.forEach(id => console.log(id));
" 2>/dev/null)

if [ -z "$NEW_IDS" ]; then
    log "No new events found"
    # Update the snapshot with latest IDs
    node -e "
    const fs = require('fs');
    const latest = \`$LATEST_IDS\`.split('\n').filter(x=>x.trim());
    const data = {
        last_updated: new Date().toISOString(),
        calendar_id: '$CALENDAR_ID',
        event_ids: latest
    };
    fs.writeFileSync('$SNAPSHOT_FILE', JSON.stringify(data, null, 2));
    "
    log "Snapshot updated"
    scan_ended_meetings_for_post
    exit 0
fi

log "Found new events: $(echo "$NEW_IDS" | tr '\n' ', ')"

# For each new event, extract details and save to new_events.jsonl
echo "$NEW_IDS" | while read -r EVENT_ID; do
    if [ -z "$EVENT_ID" ]; then continue; fi
    
    log "Processing new event: $EVENT_ID"
    
    # Extract event details using node
    PAYLOAD=$(echo "$EVENTS_RESPONSE" | node -e "
    const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
    const event = d.data.find(e => e.event_id === '$EVENT_ID');
    if (event) {
        console.log(JSON.stringify({
            event_id: event.event_id,
            title: event.title || event.summary || 'Untitled',
            start_time: event.start_time || event.start?.timestamp || 'unknown',
            end_time: event.end_time || event.end?.timestamp || 'unknown',
            participant_count: (event.attendees || []).length,
            discovered_at: new Date().toISOString()
        }));
    }
    ")
    
    log "Payload: $PAYLOAD"
    
    # Append to new events log
    echo "$PAYLOAD" >> "$WORKSPACE/meetinglog/new_events.jsonl"
    
    log "Event logged to new_events.jsonl"
done

# Update snapshot file with latest IDs
node -e "
const fs = require('fs');
const latest = \`$LATEST_IDS\`.split('\n').filter(x=>x.trim());
const data = {
    last_updated: new Date().toISOString(),
    calendar_id: '$CALENDAR_ID',
    event_ids: latest
};
fs.writeFileSync('$SNAPSHOT_FILE', JSON.stringify(data, null, 2));
"

log "Snapshot updated. Poll completed."
scan_ended_meetings_for_post
