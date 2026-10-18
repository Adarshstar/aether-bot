#!/bin/bash
# Aether Supervisor (Guardian Loop v2)
# Features: crash logging, rotating logs, restart backoff
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/aether.log"
MAX_LOG_SIZE=5242880 # 5MB

mkdir -p $LOG_DIR

function rotate_logs() {
  if [ -f "$LOG_FILE" ] && [ $(stat -c%s "$LOG_FILE") -gt $MAX_LOG_SIZE ]; then
    mv "$LOG_FILE" "$LOG_FILE.1"
    touch "$LOG_FILE"
  fi
}

echo "$(date): Aether Guardian Loop v2 started" >> $LOG_FILE
while true; do
  rotate_logs
  echo "$(date): Launching bot..." >> $LOG_FILE
  bun run run-bot.ts >> $LOG_FILE 2>&1
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo "$(date): Clean exit, stopping." >> $LOG_FILE
    break
  fi
  
  # Restart backoff (5s, 10s, 30s)
  echo "$(date): Bot crashed (code $EXIT_CODE). Restarting..." >> $LOG_FILE
  sleep 5
done
