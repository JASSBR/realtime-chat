# Real-time Chat Application

A fully functional WebSocket-based chat application with rooms, typing indicators, online user tracking, and persistent message history. Built with zero external dependencies using only native Node.js APIs.

## Features

- **Real-time Messaging** — Messages delivered instantly via WebSocket
- **Chat Rooms** — Create, join, and delete chat rooms
- **Typing Indicators** — See when others are typing with animated dots
- **Online Users** — Live presence tracking per room with user panel
- **Message History** — All messages persisted to disk and loaded on room join
- **User System** — Username-based login with localStorage persistence
- **System Notifications** — Join/leave events displayed in chat
- **Dark Theme** — Modern dark UI with smooth animations
- **Responsive Design** — Works on desktop and mobile screens
- **Auto-Reconnect** — WebSocket reconnects automatically on disconnect
- **Message Grouping** — Consecutive messages from same user grouped together
- **Date Separators** — Messages organized by day (Today, Yesterday, dates)

## Tech Stack

- **Server:** Native Node.js HTTP + custom WebSocket implementation
- **Client:** Vanilla HTML5, CSS3, JavaScript (ES2020+)
- **Storage:** JSON file-based persistence
- **Dependencies:** None (zero npm packages)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/JASSBR/realtime-chat.git
cd realtime-chat

# Start the server
npm start

# Or with auto-reload during development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Open multiple tabs to test real-time features.

## Project Structure

```
realtime-chat/
├── client/
│   ├── index.html              # Main HTML with login + chat UI
│   └── src/
│       ├── app.js              # Client-side logic, WebSocket client, rendering
│       └── style.css           # Dark theme styles and animations
├── server/
│   ├── index.js                # HTTP server, WebSocket handler, chat logic
│   ├── websocket.js            # Custom WebSocket server (RFC 6455)
│   └── routes/
│       └── api.js              # REST API for rooms and messages
├── data/
│   └── store.json              # JSON file persistence
├── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms` | List all rooms |
| POST | `/api/rooms` | Create a new room |
| DELETE | `/api/rooms/:id` | Delete a room and its messages |
| GET | `/api/rooms/:id/messages` | Get message history (supports `?limit=N`) |
| POST | `/api/rooms/:id/messages` | Post a message to a room |

## WebSocket Protocol

Messages are JSON objects with a `type` field:

**Client to Server:**
| Type | Fields | Description |
|------|--------|-------------|
| `join_room` | `roomId`, `username` | Join a chat room |
| `leave_room` | — | Leave current room |
| `send_message` | `text` | Send a message |
| `typing_start` | — | Signal typing started |
| `typing_stop` | — | Signal typing stopped |

**Server to Client:**
| Type | Fields | Description |
|------|--------|-------------|
| `connected` | `clientId` | Connection established |
| `room_joined` | `roomId`, `users` | Successfully joined room |
| `user_joined` | `username`, `users`, `timestamp` | Another user joined |
| `user_left` | `username`, `users`, `timestamp` | A user left |
| `new_message` | `message` | New chat message |
| `typing_start` | `username` | User started typing |
| `typing_stop` | `username` | User stopped typing |
| `error` | `message` | Error notification |

## Screenshots

### Login Screen
The login screen with username input and gradient branding.

### Chat Interface
Main chat interface showing sidebar with rooms, message area, and online users panel.

### Typing Indicators
Animated typing indicators showing when other users are composing messages.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (set via environment) |

```bash
PORT=8080 npm start
```

## License

MIT

---

Built as part of my **Daily Project Challenge** - Day 3
