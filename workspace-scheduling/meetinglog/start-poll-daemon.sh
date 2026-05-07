#!/bin/bash
# 日历轮询守护进程 - 每 30 秒执行一次 poll-calendar.sh

POLL_SCRIPT="/home/node/.openclaw/workspace-scheduling/meetinglog/poll-calendar.sh"
PID_FILE="/home/node/.openclaw/workspace-scheduling/meetinglog/poll-daemon.pid"
DAEMON_LOG="/home/node/.openclaw/workspace-scheduling/meetinglog/daemon.log"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$DAEMON_LOG"
}

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        log "Daemon already running (PID: $OLD_PID)"
        exit 0
    else
        log "Stale PID file found, cleaning up"
        rm -f "$PID_FILE"
    fi
fi

log "Starting poll daemon..."

# Main loop
while true; do
    log "=== Poll cycle started ==="
    
    # Execute poll script
    bash "$POLL_SCRIPT" >> "$DAEMON_LOG" 2>&1
    
    log "=== Poll cycle completed, sleeping 30s ==="
    
    # Sleep for 30 seconds
    sleep 30
done &

# Save PID
echo $! > "$PID_FILE"
log "Daemon started with PID $(cat $PID_FILE)"
