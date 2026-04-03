#!/bin/sh
set -e
echo "Starting Nakama..."
/nakama/nakama migrate up --database.address "$DB_URL"
exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DB_URL" \
  --socket.server_key defaultkey \
  --socket.port 10000 \
  --api.port 10000 \
  --runtime.path /nakama/data/modules