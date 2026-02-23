const http = require('http');
const fs = require('fs');
const path = require('path');
const { apiRouter, readData, writeData, generateId } = require('./routes/api');
const { WebSocketServer } = require('./websocket');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    return apiRouter(req, res);
  }

  let filePath = path.join(CLIENT_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(CLIENT_DIR, 'index.html'), (e, html) => {
          if (e) {
            res.writeHead(500);
            res.end('Server error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

const wss = new WebSocketServer(server);

// Track rooms -> set of client IDs, and typing status
const roomClients = new Map();
const typingUsers = new Map();

function getRoomUserList(roomId) {
  const clientIds = roomClients.get(roomId);
  if (!clientIds) return [];
  const users = [];
  for (const id of clientIds) {
    const client = wss.clients.get(id);
    if (client?.data?.username) {
      users.push({
        id: client.id,
        username: client.data.username,
        joinedAt: client.data.joinedAt,
      });
    }
  }
  return users;
}

function broadcastToRoom(roomId, data, excludeClientId) {
  wss.broadcast(data, (client) => {
    if (excludeClientId && client.id === excludeClientId) return false;
    return client.data.roomId === roomId;
  });
}

function clearTyping(client) {
  const roomId = client.data.roomId;
  const username = client.data.username;
  if (roomId && username) {
    const key = `${roomId}:${username}`;
    const timer = typingUsers.get(key);
    if (timer) {
      clearTimeout(timer);
      typingUsers.delete(key);
    }
    broadcastToRoom(roomId, {
      type: 'typing_stop',
      username,
      roomId,
    }, client.id);
  }
}

wss.on('connection', (client) => {
  wss.send(client, { type: 'connected', clientId: client.id });
});

wss.on('message', (client, message) => {
  switch (message.type) {
    case 'join_room': {
      const { roomId, username } = message;
      if (!roomId || !username || typeof username !== 'string' || username.trim().length === 0) {
        wss.send(client, { type: 'error', message: 'Room ID and username are required' });
        return;
      }

      // Leave previous room if any
      if (client.data.roomId) {
        const prevRoom = client.data.roomId;
        const clients = roomClients.get(prevRoom);
        if (clients) {
          clients.delete(client.id);
          if (clients.size === 0) roomClients.delete(prevRoom);
        }
        clearTyping(client);
        broadcastToRoom(prevRoom, {
          type: 'user_left',
          username: client.data.username,
          roomId: prevRoom,
          users: getRoomUserList(prevRoom),
          timestamp: new Date().toISOString(),
        });
      }

      client.data.username = username.trim();
      client.data.roomId = roomId;
      client.data.joinedAt = new Date().toISOString();

      if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
      roomClients.get(roomId).add(client.id);

      const users = getRoomUserList(roomId);

      wss.send(client, {
        type: 'room_joined',
        roomId,
        users,
      });

      broadcastToRoom(roomId, {
        type: 'user_joined',
        username: client.data.username,
        roomId,
        users,
        timestamp: new Date().toISOString(),
      }, client.id);
      break;
    }

    case 'leave_room': {
      if (!client.data.roomId) return;
      const roomId = client.data.roomId;
      const clients = roomClients.get(roomId);
      if (clients) {
        clients.delete(client.id);
        if (clients.size === 0) roomClients.delete(roomId);
      }
      clearTyping(client);

      broadcastToRoom(roomId, {
        type: 'user_left',
        username: client.data.username,
        roomId,
        users: getRoomUserList(roomId),
        timestamp: new Date().toISOString(),
      });

      client.data.roomId = null;
      wss.send(client, { type: 'room_left', roomId });
      break;
    }

    case 'send_message': {
      const { text } = message;
      if (!client.data.roomId || !client.data.username) {
        wss.send(client, { type: 'error', message: 'You must join a room first' });
        return;
      }
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        wss.send(client, { type: 'error', message: 'Message text is required' });
        return;
      }
      if (text.trim().length > 2000) {
        wss.send(client, { type: 'error', message: 'Message must be 2000 characters or less' });
        return;
      }

      clearTyping(client);

      const roomId = client.data.roomId;
      const msg = {
        id: generateId(),
        roomId,
        username: client.data.username,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };

      // Persist to store
      const data = readData();
      data.messages.push(msg);
      writeData(data);

      broadcastToRoom(roomId, {
        type: 'new_message',
        message: msg,
      });
      break;
    }

    case 'typing_start': {
      if (!client.data.roomId || !client.data.username) return;
      const roomId = client.data.roomId;
      const username = client.data.username;
      const key = `${roomId}:${username}`;

      // Clear existing timer
      const existing = typingUsers.get(key);
      if (existing) clearTimeout(existing);

      // Auto-stop after 3 seconds
      typingUsers.set(
        key,
        setTimeout(() => {
          typingUsers.delete(key);
          broadcastToRoom(roomId, {
            type: 'typing_stop',
            username,
            roomId,
          }, client.id);
        }, 3000)
      );

      broadcastToRoom(roomId, {
        type: 'typing_start',
        username,
        roomId,
      }, client.id);
      break;
    }

    case 'typing_stop': {
      clearTyping(client);
      break;
    }
  }
});

wss.on('close', (client) => {
  if (client.data.roomId) {
    const roomId = client.data.roomId;
    const clients = roomClients.get(roomId);
    if (clients) {
      clients.delete(client.id);
      if (clients.size === 0) roomClients.delete(roomId);
    }
    clearTyping(client);

    broadcastToRoom(roomId, {
      type: 'user_left',
      username: client.data.username,
      roomId,
      users: getRoomUserList(roomId),
      timestamp: new Date().toISOString(),
    });
  }
});

wss.startHeartbeat(30000);

// Seed default rooms if empty
const data = readData();
if (data.rooms.length === 0) {
  data.rooms = [
    {
      id: generateId(),
      name: 'General',
      description: 'General discussion for everyone',
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Random',
      description: 'Off-topic conversations and fun',
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Tech Talk',
      description: 'Programming, tech news, and development',
      createdAt: new Date().toISOString(),
    },
  ];
  writeData(data);
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
