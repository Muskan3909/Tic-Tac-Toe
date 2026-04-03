#!/bin/sh
set -e
echo "Starting Nakama..."
/nakama/nakama migrate up --database.address "$DB_URL"
exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DB_URL" \
  --socket.server_key defaultkey \
  --runtime.path /nakama/data/modules