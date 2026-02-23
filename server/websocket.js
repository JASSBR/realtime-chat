const crypto = require('crypto');

const OPCODES = {
  TEXT: 0x1,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
};

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB4085B9164';

class WebSocketServer {
  constructor(httpServer) {
    this.clients = new Map();
    this.handlers = new Map();
    this.nextId = 1;

    httpServer.on('upgrade', (req, socket, head) => {
      if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy();
        return;
      }
      this._handleUpgrade(req, socket);
    });
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  _handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    socket.write(headers);

    const clientId = this.nextId++;
    const client = {
      id: clientId,
      socket,
      alive: true,
      data: {},
    };
    this.clients.set(clientId, client);

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const result = this._decodeFrame(buffer);
        if (!result) break;
        const { frame, bytesConsumed } = result;
        buffer = buffer.subarray(bytesConsumed);
        this._handleFrame(client, frame);
      }
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
      const handler = this.handlers.get('close');
      if (handler) handler(client);
    });

    socket.on('error', () => {
      this.clients.delete(clientId);
      const handler = this.handlers.get('close');
      if (handler) handler(client);
    });

    const handler = this.handlers.get('connection');
    if (handler) handler(client);
  }

  _decodeFrame(buffer) {
    if (buffer.length < 2) return null;

    const firstByte = buffer[0];
    const secondByte = buffer[1];
    const opcode = firstByte & 0x0f;
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (buffer.length < 4) return null;
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (buffer.length < 10) return null;
      const high = buffer.readUInt32BE(2);
      const low = buffer.readUInt32BE(6);
      payloadLength = high * 2 ** 32 + low;
      offset = 10;
    }

    const maskSize = isMasked ? 4 : 0;
    const totalLength = offset + maskSize + payloadLength;
    if (buffer.length < totalLength) return null;

    let mask = null;
    if (isMasked) {
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    const payload = Buffer.alloc(payloadLength);
    buffer.copy(payload, 0, offset, offset + payloadLength);

    if (mask) {
      for (let i = 0; i < payloadLength; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    return {
      frame: { opcode, payload },
      bytesConsumed: totalLength,
    };
  }

  _handleFrame(client, frame) {
    switch (frame.opcode) {
      case OPCODES.TEXT: {
        const text = frame.payload.toString('utf8');
        try {
          const message = JSON.parse(text);
          const handler = this.handlers.get('message');
          if (handler) handler(client, message);
        } catch {
          // Ignore non-JSON messages
        }
        break;
      }
      case OPCODES.CLOSE:
        this._sendClose(client);
        client.socket.end();
        break;
      case OPCODES.PING:
        this._sendPong(client, frame.payload);
        break;
      case OPCODES.PONG:
        client.alive = true;
        break;
    }
  }

  _encodeFrame(opcode, payload) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    const length = data.length;
    let header;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }

    return Buffer.concat([header, data]);
  }

  send(client, data) {
    const json = JSON.stringify(data);
    const frame = this._encodeFrame(OPCODES.TEXT, json);
    if (client.socket.writable) {
      client.socket.write(frame);
    }
  }

  broadcast(data, filterFn) {
    for (const client of this.clients.values()) {
      if (!filterFn || filterFn(client)) {
        this.send(client, data);
      }
    }
  }

  _sendClose(client) {
    const frame = this._encodeFrame(OPCODES.CLOSE, Buffer.alloc(0));
    if (client.socket.writable) {
      client.socket.write(frame);
    }
  }

  _sendPong(client, payload) {
    const frame = this._encodeFrame(OPCODES.PONG, payload);
    if (client.socket.writable) {
      client.socket.write(frame);
    }
  }

  startHeartbeat(intervalMs = 30000) {
    setInterval(() => {
      for (const client of this.clients.values()) {
        if (!client.alive) {
          client.socket.destroy();
          this.clients.delete(client.id);
          const handler = this.handlers.get('close');
          if (handler) handler(client);
          continue;
        }
        client.alive = false;
        const frame = this._encodeFrame(OPCODES.PING, Buffer.alloc(0));
        if (client.socket.writable) {
          client.socket.write(frame);
        }
      }
    }, intervalMs);
  }
}

module.exports = { WebSocketServer };
