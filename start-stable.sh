#!/bin/bash
LOG_FILE="/home/ubuntu/aether-live/bot_stable.log"
echo "--- Guardian Loop Started $(date) ---" >> "$LOG_FILE"
while true; do
    echo "[$(date)] Starting Aether Engine..." >> "$LOG_FILE"
    /home/ubuntu/.bun/bin/bun run /home/ubuntu/aether-live/run-bot.ts >> "$LOG_FILE" 2>&1
    echo "[$(date)] Bot exited. Restarting in 10s..." >> "$LOG_FILE"
    sleep 10
done
