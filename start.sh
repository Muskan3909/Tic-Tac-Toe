#!/bin/sh
set -e
echo "DB_URL is: $DB_URL"
/nakama/nakama migrate up --database.address "$DB_URL"
exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DB_URL" \
  --socket.server_key defaultkey \
  --runtime.path /nakama/data/modules