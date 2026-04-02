FROM heroiclabs/nakama:3.21.1

COPY index.js /nakama/data/modules/index.js

EXPOSE 7349 7350 7351
