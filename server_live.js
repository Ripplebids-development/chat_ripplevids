const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
require('dotenv').config();

// ANSI Console Colors for Premium Logging
const COLORS = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m"
};

const app = express();
app.use(express.json());

// Enable CORS for frontend and API clients
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Port configuration
const PORT = process.env.PORT_LIVE || 3990;

// Room management
// Key: live_session_id, Value: Set of connected client sockets
const rooms = new Map();

// Helper to broadcast to all sockets in a specific room
function broadcastToRoom(liveSessionId, payload, excludeSocket = null) {
    const clients = rooms.get(liveSessionId);
    if (!clients) return;

    const messageStr = JSON.stringify(payload);
    let broadcastCount = 0;

    clients.forEach(client => {
        if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            broadcastCount++;
        }
    });

    console.log(`${COLORS.blue}[Broadcast]${COLORS.reset} Sent event "${payload.event}" to ${broadcastCount} clients in room ${liveSessionId}`);
}

// REST Endpoints

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'livestream-chat', uptime: process.uptime() });
});

/**
 * REST API: Fetch recent 50 messages for a livestream chat session
 * Helps new users join and instantly view the existing chat history (TikTok-style)
 */
app.get('/api/live/chat/:liveSessionId', async (req, res) => {
    try {
        const { liveSessionId } = req.params;
        console.log(`${COLORS.cyan}[REST API]${COLORS.reset} Fetching history for session: ${liveSessionId}`);

        // 1. Resolve the live stream primary key (id) from live_session_id or external_id
        const [streams] = await db.execute(
            'SELECT id FROM live_streams WHERE live_session_id = ? OR external_id = ? OR id = ? LIMIT 1',
            [liveSessionId, liveSessionId, liveSessionId]
        );

        if (streams.length === 0) {
            return res.status(404).json({ success: false, error: 'Live stream not found' });
        }

        const liveStreamId = streams[0].id;

        // 2. Fetch latest 50 messages from the database
        const [messages] = await db.execute(
            `SELECT id, user_id, author_name as username, message, created_at 
             FROM live_chat_messages 
             WHERE live_stream_id = ? 
             ORDER BY created_at ASC 
             LIMIT 50`,
            [liveStreamId]
        );

        // Normalize created_at to timestamp
        const normalizedMessages = messages.map(msg => ({
            id: msg.id,
            user: msg.username,
            text: msg.message,
            ts: msg.created_at ? new Date(msg.created_at).getTime() : Date.now()
        }));

        return res.json({
            success: true,
            live_stream_id: liveStreamId,
            messages: normalizedMessages
        });
    } catch (error) {
        console.error(`${COLORS.red}[Error]${COLORS.reset} Failed to fetch chat history:`, error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Create HTTP server wrapping express app
const server = http.createServer(app);

// Create raw WebSocket server attaching to the HTTP server
const wss = new WebSocket.Server({ server });

// WebSocket Connection Handler
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`${COLORS.green}[WS Connect]${COLORS.reset} New client connection initialized from IP: ${clientIp}`);

    // Client metadata
    ws.isAlive = true;
    ws.liveSessionId = null;
    ws.userId = null;
    ws.username = null;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', async (messageStr) => {
        try {
            const rawMsg = JSON.parse(messageStr);
            const { event, data } = rawMsg;

            if (!event) {
                ws.send(JSON.stringify({ event: 'error', data: { message: 'Missing event field' } }));
                return;
            }

            console.log(`${COLORS.cyan}[WS Message]${COLORS.reset} Event: "${event}", Data:`, JSON.stringify(data));

            switch (event) {
                case 'join':
                    await handleJoin(ws, data);
                    break;
                case 'message':
                    await handleMessage(ws, data);
                    break;
                case 'user_typing':
                    handleTyping(ws);
                    break;
                case 'leave':
                    handleLeave(ws);
                    break;
                default:
                    ws.send(JSON.stringify({ event: 'error', data: { message: `Unknown event: ${event}` } }));
                    break;
            }
        } catch (err) {
            console.error(`${COLORS.red}[WS Error]${COLORS.reset} Failed to process socket message:`, err);
            ws.send(JSON.stringify({ event: 'error', data: { message: 'Invalid payload schema' } }));
        }
    });

    // Handle client disconnect
    ws.on('close', (code, reason) => {
        console.log(`${COLORS.red}[WS Disconnect]${COLORS.reset} Connection closed. Code: ${code}, Reason: ${reason || 'None'}`);
        handleLeave(ws);
    });

    ws.on('error', (err) => {
        console.error(`${COLORS.red}[WS Socket Error]${COLORS.reset}`, err);
    });
});

// WebSocket Event Handlers

/**
 * Handle user joining a specific livestream chat room
 */
async function handleJoin(ws, data) {
    const { live_session_id, user_id } = data;

    if (!live_session_id) {
        ws.send(JSON.stringify({ event: 'error', data: { message: 'Missing live_session_id' } }));
        return;
    }

    // If client is already in a room, leave it first
    if (ws.liveSessionId) {
        handleLeave(ws);
    }

    ws.liveSessionId = live_session_id;
    ws.userId = user_id || null;

    // Fetch user details from database if user_id is provided
    let dbUsername = null;
    if (user_id) {
        try {
            console.log(`${COLORS.yellow}[DB Query]${COLORS.reset} Fetching username for ID: ${user_id}`);
            const [rows] = await db.execute('SELECT username FROM users WHERE id = ? LIMIT 1', [user_id]);
            if (rows.length > 0 && rows[0].username) {
                dbUsername = rows[0].username;
                console.log(`${COLORS.green}[DB Success]${COLORS.reset} Resolved username: @${dbUsername}`);
            }
        } catch (e) {
            console.error(`${COLORS.red}[DB Error]${COLORS.reset} Failed to query users table:`, e);
        }
    }

    // Assign display username
    if (dbUsername) {
        ws.username = dbUsername;
    } else if (user_id) {
        ws.username = `User_${String(user_id).slice(0, 5)}`;
    } else {
        ws.username = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Add socket to room mapping
    if (!rooms.has(live_session_id)) {
        rooms.set(live_session_id, new Set());
    }
    rooms.get(live_session_id).add(ws);

    const viewerCount = rooms.get(live_session_id).size;

    console.log(`${COLORS.green}[Room Join]${COLORS.reset} User @${ws.username} (${ws.userId || 'Guest'}) joined room ${live_session_id}. Current Viewers: ${viewerCount}`);

    // 1. Send connection success event to the joining client
    ws.send(JSON.stringify({
        event: 'system',
        data: { message: `Welcome to the livestream! Connected as ${ws.username}` }
    }));

    // 2. Broadcast system message to all clients in the room
    broadcastToRoom(live_session_id, {
        event: 'system',
        data: { message: `${ws.username} joined the chat` }
    });

    // 3. Broadcast updated viewer count to all clients in the room
    broadcastToRoom(live_session_id, {
        event: 'viewer_count',
        data: { count: viewerCount }
    });
}

/**
 * Handle new chat messages sent from clients
 */
async function handleMessage(ws, data) {
    const { message } = data;

    if (!ws.liveSessionId) {
        ws.send(JSON.stringify({ event: 'error', data: { message: 'You must join a room first' } }));
        return;
    }

    const messageText = String(message || '').trim();
    if (!messageText) {
        ws.send(JSON.stringify({ event: 'error', data: { message: 'Message content cannot be empty' } }));
        return;
    }

    const liveSessionId = ws.liveSessionId;
    const userId = ws.userId;
    const username = ws.username;

    try {
        console.log(`${COLORS.yellow}[DB Query]${COLORS.reset} Resolving live_stream_id for session: ${liveSessionId}`);
        
        // 1. Resolve live stream ID from database
        const [streams] = await db.execute(
            'SELECT id FROM live_streams WHERE live_session_id = ? OR external_id = ? OR id = ? LIMIT 1',
            [liveSessionId, liveSessionId, liveSessionId]
        );

        if (streams.length === 0) {
            console.error(`${COLORS.red}[Error]${COLORS.reset} Live stream not found in DB for session: ${liveSessionId}`);
            ws.send(JSON.stringify({ event: 'error', data: { message: 'Livestream session does not exist' } }));
            return;
        }

        const liveStreamId = streams[0].id;

        // 2. Persist the message in live_chat_messages table
        console.log(`${COLORS.yellow}[DB Insert]${COLORS.reset} Saving message into live_chat_messages...`);
        const [result] = await db.execute(
            'INSERT INTO live_chat_messages (live_stream_id, user_id, author_name, message, created_at) VALUES (?, ?, ?, ?, NOW())',
            [liveStreamId, userId || null, username, messageText]
        );

        const savedMsgId = result.insertId;
        const ts = Date.now();

        // 3. Broadcast the saved message to all clients in the room
        broadcastToRoom(liveSessionId, {
            event: 'message',
            data: {
                id: savedMsgId,
                user_id: userId,
                username: username,
                message: messageText,
                created_at: ts
            }
        });

        console.log(`${COLORS.green}[Chat Saved]${COLORS.reset} Message #${savedMsgId} by @${username} stored successfully`);

    } catch (e) {
        console.error(`${COLORS.red}[DB Write Failure]${COLORS.reset} Failed to save/broadcast chat message:`, e);
        ws.send(JSON.stringify({ event: 'error', data: { message: 'Internal server error saving message' } }));
    }
}

/**
 * Handle user typing event
 */
function handleTyping(ws) {
    if (!ws.liveSessionId) return;

    // Broadcast user typing notification to all other clients in the room
    broadcastToRoom(ws.liveSessionId, {
        event: 'user_typing',
        data: {
            user_id: ws.userId,
            username: ws.username
        }
    }, ws); // Exclude the typing user themselves!
}

/**
 * Handle leaving a room (explicit or on disconnect)
 */
function handleLeave(ws) {
    const liveSessionId = ws.liveSessionId;
    if (!liveSessionId) return;

    const clients = rooms.get(liveSessionId);
    if (clients) {
        clients.delete(ws);
        const remainingCount = clients.size;

        console.log(`${COLORS.red}[Room Leave]${COLORS.reset} User @${ws.username} left room ${liveSessionId}. Remaining: ${remainingCount}`);

        if (remainingCount === 0) {
            // Clean up empty room to conserve memory
            rooms.delete(liveSessionId);
            console.log(`${COLORS.magenta}[Room Clean]${COLORS.reset} Cleaned up empty room: ${liveSessionId}`);
        } else {
            // Broadcast system leave message to remaining users
            broadcastToRoom(liveSessionId, {
                event: 'system',
                data: { message: `${ws.username} left the chat` }
            });

            // Broadcast updated viewer count to remaining users
            broadcastToRoom(liveSessionId, {
                event: 'viewer_count',
                data: { count: remainingCount }
            });
        }
    }

    // Clear client session cache
    ws.liveSessionId = null;
}

// Periodically monitor connection health (Heartbeat)
const healthCheckInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log(`${COLORS.red}[WS Heartbeat]${COLORS.reset} Client lost connection. Terminating...`);
            handleLeave(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Handle server termination cleanups
wss.on('close', () => {
    clearInterval(healthCheckInterval);
});

// Start the server
server.listen(PORT, () => {
    console.log(`\n${COLORS.green}================================================================${COLORS.reset}`);
    console.log(`${COLORS.green}🚀 RIPPLEVIDS LIVESTREAM CHAT BACKEND IS ONLINE!${COLORS.reset}`);
    console.log(`${COLORS.green}📡 WebSocket Protocol wss:// (or ws://) on Port: ${COLORS.blue}${PORT}${COLORS.reset}`);
    console.log(`${COLORS.green}🏥 Health Check Route: ${COLORS.blue}http://localhost:${PORT}/health${COLORS.reset}`);
    console.log(`${COLORS.green}================================================================${COLORS.reset}\n`);
});
