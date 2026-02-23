const { WebSocketServer: WSServer } = require('ws');

class WebSocketServer {
  constructor(httpServer) {
    this.clients = new Map();
    this.handlers = new Map();
    this.nextId = 1;

    this.wss = new WSServer({ server: httpServer });

    this.wss.on('connection', (ws) => {
      const clientId = this.nextId++;
      const client = {
        id: clientId,
        ws,
        alive: true,
        data: {},
      };
      this.clients.set(clientId, client);

      ws.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          const handler = this.handlers.get('message');
          if (handler) handler(client, message);
        } catch { /* ignore non-JSON */ }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        const handler = this.handlers.get('close');
        if (handler) handler(client);
      });

      ws.on('error', () => {
        this.clients.delete(clientId);
        const handler = this.handlers.get('close');
        if (handler) handler(client);
      });

      ws.on('pong', () => {
        client.alive = true;
      });

      const handler = this.handlers.get('connection');
      if (handler) handler(client);
    });
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  send(client, data) {
    const json = JSON.stringify(data);
    if (client.ws.readyState === 1) {
      client.ws.send(json);
    }
  }

  broadcast(data, filterFn) {
    for (const client of this.clients.values()) {
      if (!filterFn || filterFn(client)) {
        this.send(client, data);
      }
    }
  }

  startHeartbeat(intervalMs = 30000) {
    setInterval(() => {
      for (const client of this.clients.values()) {
        if (!client.alive) {
          client.ws.terminate();
          this.clients.delete(client.id);
          const handler = this.handlers.get('close');
          if (handler) handler(client);
          continue;
        }
        client.alive = false;
        client.ws.ping();
      }
    }, intervalMs);
  }
}

module.exports = { WebSocketServer };
