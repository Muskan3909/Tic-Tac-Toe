FROM heroiclabs/nakama:3.21.1

COPY index.js /nakama/data/modules/index.js
COPY start.sh /nakama/start.sh

RUN chmod +x /nakama/start.sh

EXPOSE 7349 7350 7351

ENTRYPOINT ["/nakama/start.sh"]