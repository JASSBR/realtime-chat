const API = '/api';

const state = {
  username: null,
  currentRoomId: null,
  rooms: [],
  messages: [],
  onlineUsers: [],
  typingUsers: new Set(),
  ws: null,
  reconnectTimer: null,
  typingTimer: null,
  usersPanelOpen: false,
};

// DOM refs
const $ = (sel) => document.querySelector(sel);
const loginScreen = $('#login-screen');
const chatScreen = $('#chat-screen');
const loginForm = $('#login-form');
const usernameInput = $('#username-input');
const loginError = $('#login-error');
const roomList = $('#room-list');
const createRoomBtn = $('#create-room-btn');
const logoutBtn = $('#logout-btn');
const currentUsernameEl = $('#current-username');
const userAvatar = $('#user-avatar');
const noRoom = $('#no-room');
const activeChat = $('#active-chat');
const roomNameEl = $('#room-name');
const roomDescEl = $('#room-description');
const messagesEl = $('#messages');
const messageForm = $('#message-form');
const messageInput = $('#message-input');
const sendBtn = $('#send-btn');
const typingIndicator = $('#typing-indicator');
const typingText = $('#typing-text');
const toggleUsersBtn = $('#toggle-users-btn');
const usersPanel = $('#users-panel');
const usersList = $('#users-list');
const onlineCount = $('#online-count');
const deleteRoomBtn = $('#delete-room-btn');
const createRoomModal = $('#create-room-modal');
const createRoomForm = $('#create-room-form');
const roomNameInput = $('#room-name-input');
const roomDescInput = $('#room-desc-input');
const createRoomError = $('#create-room-error');
const closeModalBtn = $('#close-modal-btn');
const cancelModalBtn = $('#cancel-modal-btn');
const toastContainer = $('#toast-container');

// Utilities
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getInitials(name) {
  return name.charAt(0).toUpperCase();
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'error') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// API calls
async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function fetchRooms() {
  return api('/rooms');
}

async function createRoom(name, description) {
  return api('/rooms', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

async function deleteRoom(id) {
  return api(`/rooms/${id}`, { method: 'DELETE' });
}

async function fetchMessages(roomId) {
  return api(`/rooms/${roomId}/messages?limit=100`);
}

// WebSocket
function connectWS() {
  if (state.ws && state.ws.readyState <= 1) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}`);

  state.ws.onopen = () => {
    clearTimeout(state.reconnectTimer);
    if (state.currentRoomId) {
      wsSend({ type: 'join_room', roomId: state.currentRoomId, username: state.username });
    }
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWSMessage(data);
    } catch { /* ignore */ }
  };

  state.ws.onclose = () => {
    state.reconnectTimer = setTimeout(connectWS, 2000);
  };

  state.ws.onerror = () => {
    state.ws.close();
  };
}

function wsSend(data) {
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(data));
  }
}

function handleWSMessage(data) {
  switch (data.type) {
    case 'connected':
      break;

    case 'room_joined':
      state.onlineUsers = data.users;
      renderOnlineUsers();
      break;

    case 'user_joined': {
      if (data.roomId !== state.currentRoomId) return;
      state.onlineUsers = data.users;
      renderOnlineUsers();
      appendSystemMessage(`${escapeHtml(data.username)} joined the room`);
      scrollToBottom();
      break;
    }

    case 'user_left': {
      if (data.roomId !== state.currentRoomId) return;
      state.onlineUsers = data.users;
      renderOnlineUsers();
      state.typingUsers.delete(data.username);
      renderTypingIndicator();
      appendSystemMessage(`${escapeHtml(data.username)} left the room`);
      scrollToBottom();
      break;
    }

    case 'new_message': {
      const msg = data.message;
      if (msg.roomId !== state.currentRoomId) return;
      state.messages.push(msg);
      state.typingUsers.delete(msg.username);
      renderTypingIndicator();
      appendMessage(msg);
      scrollToBottom();
      break;
    }

    case 'typing_start': {
      if (data.roomId !== state.currentRoomId) return;
      state.typingUsers.add(data.username);
      renderTypingIndicator();
      break;
    }

    case 'typing_stop': {
      if (data.roomId !== state.currentRoomId) return;
      state.typingUsers.delete(data.username);
      renderTypingIndicator();
      break;
    }

    case 'room_left':
      break;

    case 'error':
      showToast(data.message);
      break;
  }
}

// Rendering
function renderRooms() {
  if (state.rooms.length === 0) {
    roomList.innerHTML = '<div class="loading-spinner">No rooms yet</div>';
    return;
  }
  roomList.innerHTML = state.rooms
    .map((room) => {
      const isActive = room.id === state.currentRoomId;
      const icon = room.name.charAt(0).toUpperCase();
      return `
        <div class="room-item ${isActive ? 'active' : ''}" data-room-id="${room.id}">
          <div class="room-item-icon">${icon}</div>
          <div class="room-item-info">
            <div class="room-item-name">${escapeHtml(room.name)}</div>
            ${room.description ? `<div class="room-item-desc">${escapeHtml(room.description)}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  roomList.querySelectorAll('.room-item').forEach((el) => {
    el.addEventListener('click', () => {
      const roomId = el.dataset.roomId;
      if (roomId !== state.currentRoomId) {
        joinRoom(roomId);
      }
    });
  });
}

function renderMessages() {
  if (state.messages.length === 0) {
    messagesEl.innerHTML =
      '<div class="empty-state"><p>No messages yet. Say hello!</p></div>';
    return;
  }

  let html = '';
  let lastUsername = null;
  let lastDate = null;

  for (const msg of state.messages) {
    const msgDate = formatDate(msg.timestamp);
    if (msgDate !== lastDate) {
      html += `<div class="msg-system"><span class="msg-system-text">${msgDate}</span></div>`;
      lastDate = msgDate;
      lastUsername = null;
    }

    const isOwn = msg.username === state.username;
    if (msg.username !== lastUsername) {
      html += `
        <div class="msg-group ${isOwn ? 'msg-own' : ''}">
          <div class="msg-header">
            <span class="msg-username">${escapeHtml(msg.username)}</span>
            <span class="msg-time">${formatTime(msg.timestamp)}</span>
          </div>
      `;
      lastUsername = msg.username;
    }

    html += `<div class="msg-bubble">${escapeHtml(msg.text)}</div>`;
  }

  messagesEl.innerHTML = html;
  scrollToBottom(false);
}

function appendMessage(msg) {
  // Remove empty state if present
  const empty = messagesEl.querySelector('.empty-state');
  if (empty) empty.remove();

  const isOwn = msg.username === state.username;
  const msgDate = formatDate(msg.timestamp);

  // Check if we need a date separator
  const allDateSeps = messagesEl.querySelectorAll('.msg-system .msg-system-text');
  const lastDateEl = allDateSeps.length > 0 ? allDateSeps[allDateSeps.length - 1] : null;
  if (!lastDateEl || lastDateEl.textContent !== msgDate) {
    const dateSep = document.createElement('div');
    dateSep.className = 'msg-system';
    dateSep.innerHTML = `<span class="msg-system-text">${msgDate}</span>`;
    messagesEl.appendChild(dateSep);
  }

  // Check if last message was from same user
  const lastGroup = messagesEl.querySelector('.msg-group:last-child');
  const lastGroupUser = lastGroup?.querySelector('.msg-username')?.textContent;

  if (lastGroupUser === msg.username) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;
    lastGroup.appendChild(bubble);
  } else {
    const group = document.createElement('div');
    group.className = `msg-group ${isOwn ? 'msg-own' : ''}`;
    group.innerHTML = `
      <div class="msg-header">
        <span class="msg-username">${escapeHtml(msg.username)}</span>
        <span class="msg-time">${formatTime(msg.timestamp)}</span>
      </div>
      <div class="msg-bubble">${escapeHtml(msg.text)}</div>
    `;
    messagesEl.appendChild(group);
  }
}

function appendSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg-system';
  div.innerHTML = `<span class="msg-system-text">${text}</span>`;
  messagesEl.appendChild(div);
}

function renderOnlineUsers() {
  const count = state.onlineUsers.length;
  onlineCount.textContent = count;

  usersList.innerHTML = state.onlineUsers
    .map((user) => {
      const isYou = user.username === state.username;
      return `
        <div class="user-item">
          <div class="user-item-avatar">${getInitials(user.username)}</div>
          <span class="user-item-name">${escapeHtml(user.username)}</span>
          ${isYou ? '<span class="user-item-you">(you)</span>' : ''}
        </div>
      `;
    })
    .join('');
}

function renderTypingIndicator() {
  const typers = [...state.typingUsers].filter((u) => u !== state.username);
  if (typers.length === 0) {
    typingIndicator.classList.add('hidden');
    return;
  }
  typingIndicator.classList.remove('hidden');
  if (typers.length === 1) {
    typingText.textContent = `${typers[0]} is typing...`;
  } else if (typers.length === 2) {
    typingText.textContent = `${typers[0]} and ${typers[1]} are typing...`;
  } else {
    typingText.textContent = `${typers[0]} and ${typers.length - 1} others are typing...`;
  }
}

function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    messagesEl.scrollTo({
      top: messagesEl.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    });
  });
}

// Actions
async function loadRooms() {
  try {
    state.rooms = await fetchRooms();
    renderRooms();
  } catch (err) {
    showToast('Failed to load rooms');
  }
}

async function joinRoom(roomId) {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return;

  // Leave current room via WS
  if (state.currentRoomId) {
    wsSend({ type: 'leave_room' });
  }

  state.currentRoomId = roomId;
  state.messages = [];
  state.typingUsers.clear();
  state.onlineUsers = [];

  noRoom.classList.add('hidden');
  activeChat.classList.remove('hidden');
  roomNameEl.textContent = room.name;
  roomDescEl.textContent = room.description || '';
  messagesEl.innerHTML = '<div class="loading-spinner">Loading messages...</div>';
  renderRooms();
  renderOnlineUsers();
  renderTypingIndicator();

  // Join room via WS
  wsSend({ type: 'join_room', roomId, username: state.username });

  // Load message history
  try {
    state.messages = await fetchMessages(roomId);
    if (state.currentRoomId === roomId) {
      renderMessages();
      scrollToBottom(false);
    }
  } catch {
    messagesEl.innerHTML =
      '<div class="empty-state"><p>Failed to load messages</p></div>';
  }

  messageInput.focus();
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !state.currentRoomId) return;

  wsSend({ type: 'send_message', text });
  messageInput.value = '';
  sendBtn.disabled = true;

  // Clear typing
  clearTimeout(state.typingTimer);
  wsSend({ type: 'typing_stop' });
}

// Event Handlers
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) {
    loginError.textContent = 'Please enter a username';
    loginError.classList.remove('hidden');
    return;
  }
  if (username.length < 2) {
    loginError.textContent = 'Username must be at least 2 characters';
    loginError.classList.remove('hidden');
    return;
  }
  if (username.length > 20) {
    loginError.textContent = 'Username must be 20 characters or less';
    loginError.classList.remove('hidden');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    loginError.textContent = 'Username can only contain letters, numbers, hyphens, and underscores';
    loginError.classList.remove('hidden');
    return;
  }

  state.username = username;
  localStorage.setItem('chat_username', username);

  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  currentUsernameEl.textContent = username;
  userAvatar.textContent = getInitials(username);

  connectWS();
  loadRooms();
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

messageInput.addEventListener('input', () => {
  sendBtn.disabled = !messageInput.value.trim();

  // Typing indicator
  if (messageInput.value.trim() && state.currentRoomId) {
    wsSend({ type: 'typing_start' });
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      wsSend({ type: 'typing_stop' });
    }, 2000);
  } else {
    clearTimeout(state.typingTimer);
    wsSend({ type: 'typing_stop' });
  }
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

toggleUsersBtn.addEventListener('click', () => {
  state.usersPanelOpen = !state.usersPanelOpen;
  usersPanel.classList.toggle('hidden', !state.usersPanelOpen);
});

deleteRoomBtn.addEventListener('click', async () => {
  if (!state.currentRoomId) return;
  const room = state.rooms.find((r) => r.id === state.currentRoomId);
  if (!confirm(`Delete room "${room?.name}"? All messages will be lost.`)) return;

  try {
    await deleteRoom(state.currentRoomId);
    wsSend({ type: 'leave_room' });
    state.currentRoomId = null;
    state.messages = [];
    state.onlineUsers = [];
    state.typingUsers.clear();
    activeChat.classList.add('hidden');
    noRoom.classList.remove('hidden');
    await loadRooms();
    showToast('Room deleted', 'success');
  } catch (err) {
    showToast(err.message);
  }
});

logoutBtn.addEventListener('click', () => {
  if (state.currentRoomId) {
    wsSend({ type: 'leave_room' });
  }
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  clearTimeout(state.reconnectTimer);

  state.username = null;
  state.currentRoomId = null;
  state.rooms = [];
  state.messages = [];
  state.onlineUsers = [];
  state.typingUsers.clear();
  localStorage.removeItem('chat_username');

  chatScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  activeChat.classList.add('hidden');
  noRoom.classList.remove('hidden');
  usernameInput.value = '';
  loginError.classList.add('hidden');
});

// Create Room Modal
createRoomBtn.addEventListener('click', () => {
  createRoomModal.classList.remove('hidden');
  roomNameInput.value = '';
  roomDescInput.value = '';
  createRoomError.classList.add('hidden');
  roomNameInput.focus();
});

function closeModal() {
  createRoomModal.classList.add('hidden');
}

closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
createRoomModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

createRoomForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = roomNameInput.value.trim();
  const description = roomDescInput.value.trim();

  if (!name) {
    createRoomError.textContent = 'Room name is required';
    createRoomError.classList.remove('hidden');
    return;
  }

  try {
    const room = await createRoom(name, description);
    state.rooms.push(room);
    renderRooms();
    closeModal();
    joinRoom(room.id);
    showToast(`Room "${room.name}" created`, 'success');
  } catch (err) {
    createRoomError.textContent = err.message;
    createRoomError.classList.remove('hidden');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Init: auto-login if saved username
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('chat_username');
  if (saved) {
    usernameInput.value = saved;
  }
});
