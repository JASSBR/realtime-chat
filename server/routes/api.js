const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'store.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    const defaults = { rooms: [], messages: [] };
    writeData(defaults);
    return defaults;
  }
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function apiRouter(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split('/').filter(Boolean);

  // GET /api/rooms
  if (req.method === 'GET' && segments.length === 2 && segments[1] === 'rooms') {
    const data = readData();
    return sendJSON(res, 200, data.rooms);
  }

  // POST /api/rooms
  if (req.method === 'POST' && segments.length === 2 && segments[1] === 'rooms') {
    const body = await parseBody(req);
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return sendJSON(res, 400, { error: 'Room name is required' });
    }
    if (body.name.trim().length > 50) {
      return sendJSON(res, 400, { error: 'Room name must be 50 characters or less' });
    }
    const data = readData();
    const existing = data.rooms.find(
      (r) => r.name.toLowerCase() === body.name.trim().toLowerCase()
    );
    if (existing) {
      return sendJSON(res, 409, { error: 'A room with that name already exists' });
    }
    const room = {
      id: generateId(),
      name: body.name.trim(),
      description: body.description?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    data.rooms.push(room);
    writeData(data);
    return sendJSON(res, 201, room);
  }

  // DELETE /api/rooms/:id
  if (req.method === 'DELETE' && segments.length === 3 && segments[1] === 'rooms') {
    const roomId = segments[2];
    const data = readData();
    const index = data.rooms.findIndex((r) => r.id === roomId);
    if (index === -1) {
      return sendJSON(res, 404, { error: 'Room not found' });
    }
    data.rooms.splice(index, 1);
    data.messages = data.messages.filter((m) => m.roomId !== roomId);
    writeData(data);
    return sendJSON(res, 200, { deleted: roomId });
  }

  // GET /api/rooms/:id/messages?limit=50&before=timestamp
  if (
    req.method === 'GET' &&
    segments.length === 4 &&
    segments[1] === 'rooms' &&
    segments[3] === 'messages'
  ) {
    const roomId = segments[2];
    const data = readData();
    const room = data.rooms.find((r) => r.id === roomId);
    if (!room) {
      return sendJSON(res, 404, { error: 'Room not found' });
    }
    let messages = data.messages.filter((m) => m.roomId === roomId);
    const before = url.searchParams.get('before');
    if (before) {
      messages = messages.filter((m) => m.timestamp < before);
    }
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const sliced = messages.slice(-limit);
    return sendJSON(res, 200, sliced);
  }

  // POST /api/rooms/:id/messages
  if (
    req.method === 'POST' &&
    segments.length === 4 &&
    segments[1] === 'rooms' &&
    segments[3] === 'messages'
  ) {
    const roomId = segments[2];
    const body = await parseBody(req);
    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return sendJSON(res, 400, { error: 'Message text is required' });
    }
    if (!body.username || typeof body.username !== 'string') {
      return sendJSON(res, 400, { error: 'Username is required' });
    }
    if (body.text.trim().length > 2000) {
      return sendJSON(res, 400, { error: 'Message must be 2000 characters or less' });
    }
    const data = readData();
    const room = data.rooms.find((r) => r.id === roomId);
    if (!room) {
      return sendJSON(res, 404, { error: 'Room not found' });
    }
    const message = {
      id: generateId(),
      roomId,
      username: body.username.trim(),
      text: body.text.trim(),
      timestamp: new Date().toISOString(),
    };
    data.messages.push(message);
    writeData(data);
    return sendJSON(res, 201, message);
  }

  sendJSON(res, 404, { error: 'API route not found' });
}

module.exports = { apiRouter, readData, writeData, generateId };
