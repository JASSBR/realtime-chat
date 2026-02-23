const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'store.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { items: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function apiRouter(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/items') {
    const data = readData();
    res.writeHead(200);
    return res.end(JSON.stringify(data.items));
  }

  if (req.method === 'POST' && path === '/api/items') {
    const body = await parseBody(req);
    const data = readData();
    const item = { id: Date.now().toString(), ...body, createdAt: new Date().toISOString() };
    data.items.push(item);
    writeData(data);
    res.writeHead(201);
    return res.end(JSON.stringify(item));
  }

  if (req.method === 'DELETE' && path.startsWith('/api/items/')) {
    const id = path.split('/').pop();
    const data = readData();
    data.items = data.items.filter(item => item.id !== id);
    writeData(data);
    res.writeHead(200);
    return res.end(JSON.stringify({ deleted: id }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'API route not found' }));
}

module.exports = { apiRouter };
