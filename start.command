#!/bin/bash
# Double-click to start the dashboard. Real data: http://localhost:8081  ·  demo data: http://localhost:8082
# Close this window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")"
python3 serve.py 8081 app stickynote.md gym-log.json &
python3 serve.py 8082 app stickynote-demo.md gym-log-demo.json &
sleep 1; open http://localhost:8081
trap 'kill $(jobs -p) 2>/dev/null' EXIT
wait
