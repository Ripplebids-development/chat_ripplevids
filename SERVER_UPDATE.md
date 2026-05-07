# RippleVids Chat Backend Implementation Guide

Complete backend system specification for the RippleVids chat feature supporting real-time messaging, media attachments, and conversation management.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema](#database-schema)
3. [Socket.IO Events](#socketio-events)
4. [REST API Endpoints](#rest-api-endpoints)
5. [Media Storage](#media-storage)
6. [Security & Validation](#security--validation)
7. [Implementation Steps](#implementation-steps)

---

## System Architecture

### Tech Stack
- **Backend Framework**: Node.js + Express
- **Real-time**: Socket.IO
- **Database**: PostgreSQL (primary) + Redis (caching/presence)
- **File Storage**: AWS S3 / Cloudflare R2 / DigitalOcean Spaces
- **CDN**: CloudFront / Cloudflare CDN

### Architecture Overview
```
┌─────────────┐
│ React Native│
│   Client    │
└──────┬──────┘
       │
       ├─── Socket.IO (Real-time) ───┐
       │                              │
       └─── REST API (HTTP) ──────────┤
                                      │
                              ┌───────▼────────┐
                              │  Node.js       │
                              │  Express       │
                              │  Socket.IO     │
                              └───────┬────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
            ┌───────▼────────┐ ┌─────▼──────┐  ┌──────▼──────┐
            │   PostgreSQL   │ │   Redis    │  │  S3/R2      │
            │   (Messages)   │ │  (Presence)│  │  (Media)    │
            └────────────────┘ └────────────┘  └─────────────┘
```

---

## Database Schema

### 1. **conversations** table
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP,
  last_message_content TEXT,
  last_message_sender_id UUID,
  is_group BOOLEAN DEFAULT FALSE,
  group_name VARCHAR(255),
  group_avatar_url TEXT
);

CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
```

### 2. **conversation_participants** table
```sql
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  last_read_at TIMESTAMP,
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  role VARCHAR(50) DEFAULT 'member', -- 'admin', 'member'
  
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_participants_archived ON conversation_participants(user_id, is_archived);
```

### 3. **messages** table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  body TEXT,
  type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'video', 'voice', 'document', 'contact'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  
  -- Media fields
  media_url TEXT,
  media_thumbnail_url TEXT,
  media_type VARCHAR(50), -- 'image/jpeg', 'video/mp4', etc.
  media_size_bytes BIGINT,
  media_duration_seconds INTEGER, -- for video/voice
  media_width INTEGER, -- for images/videos
  media_height INTEGER,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_reply ON messages(reply_to_message_id);
```

### 4. **message_reads** table
```sql
CREATE TABLE message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_reads_message ON message_reads(message_id);
CREATE INDEX idx_reads_user ON message_reads(user_id);
```

### 5. **message_reactions** table
```sql
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji VARCHAR(10) NOT NULL, -- '👍', '❤️', etc.
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);
```

### 6. **blocked_users** table
```sql
CREATE TABLE blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocked_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_blocked ON blocked_users(blocked_id);
```

---

## Socket.IO Events

### Client → Server Events

#### 1. **register_user**
```javascript
socket.emit('register_user', userId);
```
Registers user's socket connection for real-time updates.

#### 2. **join_chat**
```javascript
socket.emit('join_chat', {
  userId: 'user-uuid',
  targetUserId: 'target-user-uuid'
});
```
Joins or creates a 1-on-1 conversation.

**Server Response**: `room_joined`
```javascript
{
  roomId: 'conversation-uuid',
  room: { /* conversation details */ }
}
```

#### 3. **send_message**
```javascript
socket.emit('send_message', {
  roomId: 'conversation-uuid',
  senderId: 'user-uuid',
  body: 'Hello!',
  type: 'text', // optional
  replyToMessageId: 'message-uuid', // optional
  metadata: {} // optional
});
```

#### 4. **fetch_messages**
```javascript
socket.emit('fetch_messages', {
  roomId: 'conversation-uuid',
  limit: 20,
  offset: 0
});
```

**Server Response**: `more_messages`
```javascript
{
  messages: [...],
  offset: 20,
  hasMore: true
}
```

#### 5. **get_conversations**
```javascript
socket.emit('get_conversations', {
  userId: 'user-uuid'
});
```

**Server Response**: `conversations`
```javascript
{
  conversations: [
    {
      id: 'conv-uuid',
      other_user_id: 'user-uuid',
      other_username: 'username',
      other_profile_pic_url: 'url',
      last_message: 'text',
      last_message_at: timestamp,
      last_message_sender_id: 'user-uuid',
      unread_count: 5
    }
  ]
}
```

#### 6. **mark_as_read**
```javascript
socket.emit('mark_as_read', {
  messageId: 'message-uuid',
  userId: 'user-uuid'
});
```

#### 7. **typing_start** / **typing_stop**
```javascript
socket.emit('typing_start', {
  roomId: 'conversation-uuid',
  userId: 'user-uuid'
});
```

#### 8. **delete_message**
```javascript
socket.emit('delete_message', {
  messageId: 'message-uuid',
  userId: 'user-uuid'
});
```

### Server → Client Events

#### 1. **message_history**
```javascript
{
  messages: [
    {
      id: 'msg-uuid',
      sender_id: 'user-uuid',
      body: 'Hello',
      type: 'text',
      created_at: timestamp,
      read: false,
      media_url: null,
      reply_to: null
    }
  ]
}
```

#### 2. **new_message**
```javascript
{
  id: 'msg-uuid',
  sender_id: 'user-uuid',
  body: 'New message',
  type: 'text',
  created_at: timestamp,
  conversation_id: 'conv-uuid'
}
```

#### 3. **user_typing**
```javascript
{
  userId: 'user-uuid',
  roomId: 'conversation-uuid',
  isTyping: true
}
```

#### 4. **message_deleted**
```javascript
{
  messageId: 'msg-uuid',
  conversationId: 'conv-uuid'
}
```

#### 5. **message_read**
```javascript
{
  messageId: 'msg-uuid',
  userId: 'user-uuid',
  readAt: timestamp
}
```

---

## REST API Endpoints

### 1. **Upload Media**
```
POST /api/chat/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body:
- file: File (image/video/document)
- type: 'image' | 'video' | 'voice' | 'document'
- conversationId: UUID

Response:
{
  success: true,
  data: {
    url: 'https://cdn.example.com/media/uuid.jpg',
    thumbnailUrl: 'https://cdn.example.com/media/uuid_thumb.jpg',
    type: 'image/jpeg',
    size: 1024000,
    width: 1920,
    height: 1080,
    duration: null
  }
}
```

**Validation Rules**:
- **Images**: Max 10MB, formats: jpg, png, gif, webp
- **Videos**: Max 50MB, max 10 seconds, formats: mp4, mov
- **Voice**: Max 5MB, max 60 seconds, formats: m4a, mp3, ogg
- **Documents**: Max 20MB, formats: pdf, doc, docx, txt

### 2. **Get Conversation Details**
```
GET /api/chat/conversations/:conversationId
Authorization: Bearer <token>

Response:
{
  success: true,
  data: {
    id: 'conv-uuid',
    participants: [...],
    isGroup: false,
    createdAt: timestamp,
    lastMessageAt: timestamp
  }
}
```

### 3. **Search Messages**
```
GET /api/chat/conversations/:conversationId/search?q=query
Authorization: Bearer <token>

Response:
{
  success: true,
  data: {
    messages: [...],
    total: 42
  }
}
```

### 4. **Block/Unblock User**
```
POST /api/chat/block
Authorization: Bearer <token>

Body:
{
  targetUserId: 'user-uuid',
  action: 'block' | 'unblock'
}

Response:
{
  success: true,
  message: 'User blocked successfully'
}
```

### 5. **Archive Conversation**
```
POST /api/chat/conversations/:conversationId/archive
Authorization: Bearer <token>

Body:
{
  isArchived: true
}

Response:
{
  success: true
}
```

---

## Media Storage

### Storage Structure
```
/chat-media/
  ├── images/
  │   ├── {year}/
  │   │   ├── {month}/
  │   │   │   ├── {uuid}.jpg
  │   │   │   └── {uuid}_thumb.jpg
  ├── videos/
  │   ├── {year}/
  │   │   ├── {month}/
  │   │   │   ├── {uuid}.mp4
  │   │   │   └── {uuid}_thumb.jpg
  ├── voice/
  │   └── {year}/{month}/{uuid}.m4a
  └── documents/
      └── {year}/{month}/{uuid}.pdf
```

### Media Processing Pipeline

#### Images
1. Upload original to S3
2. Generate thumbnail (300x300)
3. Compress original (max 1920px width)
4. Store URLs in database
5. Return URLs to client

#### Videos
1. Validate duration (≤10 seconds)
2. Upload original to S3
3. Generate thumbnail (first frame)
4. Transcode to H.264 if needed
5. Store URLs in database
6. Return URLs to client

#### Voice Messages
1. Upload audio file
2. Extract duration
3. Generate waveform data (optional)
4. Store URL in database
5. Return URL to client

### CDN Configuration
```javascript
// CloudFront/Cloudflare settings
{
  cacheControl: 'public, max-age=31536000', // 1 year
  contentType: 'auto-detect',
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'HEAD'],
    allowedHeaders: ['*']
  }
}
```

---

## Security & Validation

### 1. **Authentication**
```javascript
// Socket.IO middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});
```

### 2. **Authorization Checks**
```javascript
// Before sending message
async function canSendMessage(userId, conversationId) {
  // Check if user is participant
  const participant = await db.query(
    'SELECT * FROM conversation_participants WHERE user_id = $1 AND conversation_id = $2',
    [userId, conversationId]
  );
  
  if (!participant.rows.length) {
    throw new Error('Not authorized');
  }
  
  // Check if blocked
  const blocked = await db.query(
    'SELECT * FROM blocked_users WHERE (blocker_id = $1 OR blocked_id = $1)',
    [userId]
  );
  
  if (blocked.rows.length) {
    throw new Error('User is blocked');
  }
  
  return true;
}
```

### 3. **Rate Limiting**
```javascript
// Redis-based rate limiting
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads per window
  message: 'Too many uploads, please try again later'
});

app.post('/api/chat/upload', uploadLimiter, uploadHandler);
```

### 4. **Input Validation**
```javascript
const { body, validationResult } = require('express-validator');

const sendMessageValidation = [
  body('roomId').isUUID(),
  body('senderId').isUUID(),
  body('body').trim().isLength({ min: 1, max: 5000 }),
  body('type').optional().isIn(['text', 'image', 'video', 'voice', 'document'])
];
```

### 5. **File Upload Security**
```javascript
const multer = require('multer');
const path = require('path');

const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/quicktime'],
    voice: ['audio/mp4', 'audio/mpeg', 'audio/ogg'],
    document: ['application/pdf', 'application/msword']
  };
  
  const type = req.body.type || 'image';
  if (allowedTypes[type].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter
});
```

---

## Implementation Steps

### Phase 1: Core Messaging (Week 1-2)
- [ ] Set up PostgreSQL database with schema
- [ ] Implement Socket.IO server with basic events
- [ ] Create REST API for conversations
- [ ] Implement `send_message`, `fetch_messages`, `get_conversations`
- [ ] Add message read receipts
- [ ] Test with React Native client

### Phase 2: Media Support (Week 3)
- [ ] Set up S3/R2 storage
- [ ] Implement image upload endpoint
- [ ] Add image compression and thumbnail generation
- [ ] Implement video upload with duration validation
- [ ] Add video thumbnail generation
- [ ] Test media uploads from client

### Phase 3: Advanced Features (Week 4)
- [ ] Add typing indicators
- [ ] Implement message deletion
- [ ] Add message reactions
- [ ] Implement reply-to functionality
- [ ] Add voice message support
- [ ] Test all features end-to-end

### Phase 4: Optimization & Security (Week 5)
- [ ] Add Redis for presence/caching
- [ ] Implement rate limiting
- [ ] Add comprehensive error handling
- [ ] Set up CDN for media delivery
- [ ] Add monitoring and logging
- [ ] Performance testing and optimization

### Phase 5: Polish & Deploy (Week 6)
- [ ] Add message search functionality
- [ ] Implement block/unblock users
- [ ] Add conversation archiving
- [ ] Set up automated backups
- [ ] Deploy to production
- [ ] Monitor and fix issues

---

## Example Implementation Snippets

### Socket.IO Server Setup
```javascript
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*' }
});

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Socket connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('register_user', async (userId) => {
    socket.userId = userId;
    socket.join(`user:${userId}`);
  });
  
  socket.on('join_chat', async ({ userId, targetUserId }) => {
    try {
      // Find or create conversation
      let conversation = await findOrCreateConversation(userId, targetUserId);
      socket.join(`room:${conversation.id}`);
      
      // Send message history
      const messages = await getMessages(conversation.id);
      socket.emit('message_history', { messages });
      socket.emit('room_joined', { roomId: conversation.id });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  socket.on('send_message', async ({ roomId, senderId, body, type = 'text' }) => {
    try {
      // Save message to database
      const message = await saveMessage({
        conversationId: roomId,
        senderId,
        body,
        type
      });
      
      // Broadcast to room
      io.to(`room:${roomId}`).emit('new_message', message);
      
      // Update conversation
      await updateConversation(roomId, body, senderId);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Chat server running on port 3000');
});
```

### Database Helper Functions
```javascript
async function findOrCreateConversation(userId1, userId2) {
  // Check if conversation exists
  const existing = await db.query(`
    SELECT c.* FROM conversations c
    JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
    JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
    WHERE cp1.user_id = $1 AND cp2.user_id = $2 AND c.is_group = false
    LIMIT 1
  `, [userId1, userId2]);
  
  if (existing.rows.length) {
    return existing.rows[0];
  }
  
  // Create new conversation
  const newConv = await db.query(`
    INSERT INTO conversations (is_group) VALUES (false) RETURNING *
  `);
  
  const convId = newConv.rows[0].id;
  
  // Add participants
  await db.query(`
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES ($1, $2), ($1, $3)
  `, [convId, userId1, userId2]);
  
  return newConv.rows[0];
}

async function saveMessage({ conversationId, senderId, body, type }) {
  const result = await db.query(`
    INSERT INTO messages (conversation_id, sender_id, body, type)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [conversationId, senderId, body, type]);
  
  return result.rows[0];
}

async function getMessages(conversationId, limit = 50, offset = 0) {
  const result = await db.query(`
    SELECT * FROM messages
    WHERE conversation_id = $1 AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [conversationId, limit, offset]);
  
  return result.rows.reverse();
}
```

---

## Monitoring & Maintenance

### Key Metrics to Track
- Message delivery latency
- Socket connection count
- Database query performance
- Media upload success rate
- Storage usage
- API error rates

### Logging
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log all socket events
io.on('connection', (socket) => {
  logger.info('Socket connected', { socketId: socket.id, userId: socket.userId });
  
  socket.onAny((event, ...args) => {
    logger.info('Socket event', { event, socketId: socket.id, args });
  });
});
```

---

## Conclusion

This implementation guide provides a complete blueprint for building a production-ready chat system for RippleVids. Follow the phases sequentially, test thoroughly at each stage, and monitor performance in production.

**Estimated Timeline**: 6 weeks for full implementation
**Team Size**: 2-3 backend developers
**Infrastructure Cost**: ~$200-500/month (depending on usage)
