FROM heroiclabs/nakama:3.21.1

COPY index.js /nakama/data/modules/index.js

EXPOSE 7349 7350 7351

CMD ["/bin/sh", "-c", "/nakama/nakama migrate up --database.address $DB_URL && exec /nakama/nakama --name nakama1 --database.address $DB_URL --socket.server_key defaultkey --runtime.path /nakama/data/modules"]