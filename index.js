"use strict";

var moduleName = "tictactoe";
var WIN_LINES = [
  [0, 1, 2],[3, 4, 5],[6, 7, 8],
  [0, 3, 6],[1, 4, 7],[2, 5, 8],
  [0, 4, 8],[2, 4, 6]
];
var LEADERBOARD_ID = "global_leaderboard";
var COLLECTION_STATS = "player_stats";
var TURN_TIMEOUT_SEC = 30;

function checkWinner(board) {
  for (var i = 0; i < WIN_LINES.length; i++) {
    var line = WIN_LINES[i];
    var a = line[0], b = line[1], c = line[2];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: line };
    }
  }
  for (var j = 0; j < board.length; j++) {
    if (board[j] === null) return { winner: null, line: null };
  }
  return { winner: "draw", line: null };
}

function emptyBoard() {
  return [null, null, null, null, null, null, null, null, null];
}

function buildClientState(gs) {
  return {
    board: gs.board,
    currentTurn: gs.currentTurn,
    playerX: gs.playerX,
    playerO: gs.playerO,
    status: gs.status,
    winner: gs.winner,
    winLine: gs.winLine,
    moveCount: gs.moveCount,
    timerEnabled: gs.timerEnabled,
    turnDeadline: gs.turnDeadline
  };
}

var matchInit = function(ctx, logger, nk, params) {
  var timerEnabled = params && params["timer"] === "true";
  var state = {
    board: emptyBoard(),
    currentTurn: "",
    playerX: "",
    playerO: "",
    status: "waiting",
    winner: null,
    winLine: null,
    moveCount: 0,
    timerEnabled: timerEnabled,
    turnDeadline: null,
    turnTimeoutSec: TURN_TIMEOUT_SEC
  };
  return {
    state: state,
    tickRate: 1,
    label: JSON.stringify({ timerEnabled: timerEnabled, open: true })
  };
};

var matchJoinAttempt = function(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  var gs = state;
  if (gs.status !== "waiting") {
    return { state: state, accept: false, rejectMessage: "Match already in progress" };
  }
  return { state: state, accept: !gs.playerX || !gs.playerO };
};

var matchJoin = function(ctx, logger, nk, dispatcher, tick, state, presences) {
  var gs = state;
  for (var i = 0; i < presences.length; i++) {
    var p = presences[i];
    if (!gs.playerX) {
      gs.playerX = p.userId;
    } else if (!gs.playerO && p.userId !== gs.playerX) {
      gs.playerO = p.userId;
    }
  }
  if (gs.playerX && gs.playerO) {
    gs.status = "playing";
    gs.currentTurn = gs.playerX;
    if (gs.timerEnabled) {
      gs.turnDeadline = Date.now() + gs.turnTimeoutSec * 1000;
    }
    dispatcher.matchLabelUpdate(JSON.stringify({ timerEnabled: gs.timerEnabled, open: false }));
    dispatcher.broadcastMessage(1, JSON.stringify({
      type: "game_start",
      state: buildClientState(gs)
    }), null, null, true);
  }
  return { state: gs };
};

var matchLeave = function(ctx, logger, nk, dispatcher, tick, state, presences) {
  var gs = state;
  for (var i = 0; i < presences.length; i++) {
    var p = presences[i];
    if (gs.status === "playing") {
      gs.winner = p.userId === gs.playerX ? gs.playerO : gs.playerX;
      gs.status = "finished";
      dispatcher.broadcastMessage(3, JSON.stringify({
        type: "game_over",
        state: buildClientState(gs),
        reason: "disconnect"
      }), null, null, true);
      updateLeaderboard(nk, logger, gs);
    }
  }
  return { state: gs };
};

var matchLoop = function(ctx, logger, nk, dispatcher, tick, state, messages) {
  var gs = state;
  if (gs.status === "finished") return null;

  if (gs.timerEnabled && gs.turnDeadline && gs.status === "playing") {
    if (Date.now() > gs.turnDeadline) {
      var loser = gs.currentTurn;
      gs.winner = loser === gs.playerX ? gs.playerO : gs.playerX;
      gs.status = "finished";
      dispatcher.broadcastMessage(3, JSON.stringify({
        type: "game_over", state: buildClientState(gs), reason: "timeout"
      }), null, null, true);
      updateLeaderboard(nk, logger, gs);
      return { state: gs };
    }
    var remaining = Math.ceil((gs.turnDeadline - Date.now()) / 1000);
    dispatcher.broadcastMessage(5, JSON.stringify({
      type: "timer_tick", remaining: remaining, currentTurn: gs.currentTurn
    }), null, null, true);
  }

  for (var mi = 0; mi < messages.length; mi++) {
    var msg = messages[mi];
    if (msg.opCode !== 2) continue;
    var senderId = msg.sender.userId;
    if (senderId !== gs.currentTurn) {
      dispatcher.broadcastMessage(4, JSON.stringify({
        type: "error", message: "Not your turn"
      }), [msg.sender], null, true);
      continue;
    }
    var move;
    try { move = JSON.parse(nk.binaryToString(msg.data)); } catch (e) { continue; }
    var pos = move.position;
    if (typeof pos !== "number" || pos < 0 || pos > 8 || gs.board[pos] !== null) {
      dispatcher.broadcastMessage(4, JSON.stringify({
        type: "error", message: "Invalid move"
      }), [msg.sender], null, true);
      continue;
    }
    var symbol = senderId === gs.playerX ? "X" : "O";
    gs.board[pos] = symbol;
    gs.moveCount++;
    var result = checkWinner(gs.board);
    if (result.winner) {
      gs.status = "finished";
      gs.winLine = result.line;
      gs.winner = result.winner === "draw" ? "draw" : senderId;
      dispatcher.broadcastMessage(3, JSON.stringify({
        type: "game_over", state: buildClientState(gs), reason: "win"
      }), null, null, true);
      updateLeaderboard(nk, logger, gs);
    } else {
      gs.currentTurn = gs.currentTurn === gs.playerX ? gs.playerO : gs.playerX;
      if (gs.timerEnabled) gs.turnDeadline = Date.now() + gs.turnTimeoutSec * 1000;
      dispatcher.broadcastMessage(2, JSON.stringify({
        type: "move_made", state: buildClientState(gs),
        position: pos, symbol: symbol, by: senderId
      }), null, null, true);
    }
  }
  return { state: gs };
};

var matchTerminate = function(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  dispatcher.broadcastMessage(99, JSON.stringify({ type: "match_terminated" }), null, null, true);
  return { state: state };
};

var matchSignal = function(ctx, logger, nk, dispatcher, tick, state, data) {
  return { state: state, data: "" };
};

function getUsernameById(nk, userId) {
  try {
    var users = nk.usersGetId([userId]);
    if (users && users.length > 0) return users[0].username || "";
  } catch (e) {}
  return "";
}

function updateLeaderboard(nk, logger, gs) {
  if (gs.status !== "finished") return;
  logger.info("updateLeaderboard winner=" + gs.winner);
  try {
    var players = [{ id: gs.playerX }, { id: gs.playerO }];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p.id) continue;
      var isDraw = gs.winner === "draw";
      var isWinner = gs.winner === p.id;
      var stats = { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
      try {
        var objs = nk.storageRead([{ collection: COLLECTION_STATS, key: "stats", userId: p.id }]);
        if (objs && objs.length > 0) stats = objs[0].value;
      } catch (e) { logger.error("storageRead failed: " + e); }
      if (isWinner) {
        stats.wins++;
        stats.streak++;
        if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
      } else if (isDraw) {
        stats.draws++;
        stats.streak = 0;
      } else {
        stats.losses++;
        stats.streak = 0;
      }
      try {
        nk.storageWrite([{
          collection: COLLECTION_STATS,
          key: "stats",
          userId: p.id,
          value: stats,
          permissionRead: 2,
          permissionWrite: 1
        }]);
      } catch (e) { logger.error("storageWrite failed: " + e); }
      var score = stats.wins * 200 + stats.draws * 50;
      var username = getUsernameById(nk, p.id);
      try {
        nk.leaderboardRecordWrite(LEADERBOARD_ID, p.id, username, score, 0, {
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          streak: stats.streak,
          bestStreak: stats.bestStreak
        });
        logger.info("leaderboardRecordWrite OK user=" + username + " score=" + score);
      } catch (e) { logger.error("leaderboardRecordWrite failed: " + e); }
    }
  } catch (e) {
    logger.error("updateLeaderboard failed: " + e);
  }
}

var rpcCreateMatch = function(ctx, logger, nk, payload) {
  var params = {};
  try { if (payload) params = JSON.parse(payload); } catch (e) {}
  var matchId = nk.matchCreate(moduleName, { timer: params.timer ? "true" : "false" });
  return JSON.stringify({ matchId: matchId });
};

var rpcFindMatch = function(ctx, logger, nk, payload) {
  var params = {};
  try { if (payload) params = JSON.parse(payload); } catch (e) {}
  var timerEnabled = params.timer === true || params.timer === "true";

  // List matches that have exactly 1 player (waiting for opponent)
  try {
    var matches = nk.matchList(20, true, null, 1, 1, "");
    logger.info("matchList returned " + matches.length + " matches");
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      logger.info("match " + m.matchId + " label=" + m.label + " size=" + m.size);
      try {
        var label = JSON.parse(m.label);
        if (label.open === true && label.timerEnabled === timerEnabled) {
          logger.info("Joining existing match: " + m.matchId);
          return JSON.stringify({ matchId: m.matchId });
        }
      } catch (e) {}
    }
  } catch (e) {
    logger.error("matchList error: " + e);
  }

  // No open match — create one
  var matchId = nk.matchCreate(moduleName, { timer: timerEnabled ? "true" : "false" });
  logger.info("Created new match: " + matchId);
  return JSON.stringify({ matchId: matchId });
};

var rpcGetLeaderboard = function(ctx, logger, nk, payload) {
  try {
    var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 20, null, 0);
    var out = [];
    if (records && records.records) {
      for (var i = 0; i < records.records.length; i++) {
        var r = records.records[i];
        var meta = r.metadata || {};
        out.push({
          userId: r.ownerId,
          username: r.username,
          score: r.score,
          rank: r.rank,
          wins: meta.wins || 0,
          losses: meta.losses || 0,
          draws: meta.draws || 0,
          streak: meta.streak || 0
        });
      }
    }
    logger.info("Leaderboard returning " + out.length + " records");
    return JSON.stringify({ records: out });
  } catch (e) {
    logger.error("Leaderboard fetch error: " + e);
    return JSON.stringify({ records: [] });
  }
};

var rpcGetPlayerStats = function(ctx, logger, nk, payload) {
  try {
    var objs = nk.storageRead([{ collection: COLLECTION_STATS, key: "stats", userId: ctx.userId }]);
    if (objs && objs.length > 0) {
      var s = objs[0].value;
      return JSON.stringify({
        wins: s.wins || 0,
        losses: s.losses || 0,
        draws: s.draws || 0,
        streak: s.streak || 0,
        bestStreak: s.bestStreak || 0
      });
    }
  } catch (e) {}
  return JSON.stringify({ wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 });
};

function InitModule(ctx, logger, nk, initializer) {
  try {
    nk.leaderboardCreate(LEADERBOARD_ID, false, "desc", "set", "", {});
    logger.info("Leaderboard created: " + LEADERBOARD_ID);
  } catch (e) {
    logger.info("Leaderboard note: " + e);
  }
  initializer.registerMatch(moduleName, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal
  });
  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("find_match", rpcFindMatch);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
  initializer.registerRpc("get_player_stats", rpcGetPlayerStats);
  logger.info("Tic-Tac-Toe module loaded OK");
}
globalThis.InitModule = InitModule;