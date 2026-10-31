'use strict';

// ユーザー・ゲームの履歴・ハイスコアの保存(localStorage)

/* =========================================================
   ユーザー・履歴・ハイスコア(すべて localStorage)
   ========================================================= */
function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function createUser(name) {
  const users = loadUsers();
  const user = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
  };
  users.push(user);
  saveUsers(users);
  return user;
}
function findUser(id) {
  return loadUsers().find(u => u.id === id) || null;
}
function getCurrentUserId() {
  return localStorage.getItem(CURRENT_USER_KEY);
}
function setCurrentUserId(id) {
  localStorage.setItem(CURRENT_USER_KEY, id);
}

function loadHistory(userId) {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY_PREFIX + userId) || '[]');
  } catch {
    return [];
  }
}
function appendHistory(userId, summary) {
  const history = loadHistory(userId);
  history.push(summary);
  while (history.length > HISTORY_LIMIT) history.shift();
  localStorage.setItem(HISTORY_KEY_PREFIX + userId, JSON.stringify(history));
  return history;
}

function getHighScore(userId) {
  return Number(localStorage.getItem(HIGHSCORE_KEY_PREFIX + userId) || 0);
}
function setHighScoreIfNeeded(userId, score) {
  const cur = getHighScore(userId);
  if (score > cur) {
    localStorage.setItem(HIGHSCORE_KEY_PREFIX + userId, String(score));
    return true;
  }
  return false;
}

let currentUser = null; // { id, name }
