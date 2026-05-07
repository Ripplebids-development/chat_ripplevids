# RippleVids Chat API Reference
**Version:** 1.0  
**Last Updated:** May 7, 2026  
**Server:** Node.js + Express + Socket.IO on Port 3904

---

## Table of Contents
1. [Base Configuration](#base-configuration)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [Socket.IO Events](#socketio-events)
5. [Data Structures](#data-structures)
6. [Error Handling](#error-handling)

---

## Base Configuration

### Server Details
```
URL: https://ripplevids-chat.ripplebids.com
Protocol: HTTP/REST + WebSocket/Socket.IO
CORS: Enabled for all origins
Content-Type: application/json
Max Payload: 50MB
```

### Common Headers
```
Content-Type: application/json
Content-Length: [calculated]
```

---

## Authentication

### Current Implementation
- **Method:** None (open access)
- **JWT Support:** Not yet implemented
- **Token Format:** N/A

### Future Implementation
```
Authorization: Bearer <JWT_TOKEN>
Header: Required for all endpoints
```

---

## REST API Endpoints

### 1. Upload Media

**Endpoint:** `POST /api/chat/upload`

**Purpose:** Upload media files (images, videos, voice, documents) with automatic storage to local directory

**Content-Type:** `multipart/form-data`

**Request Parameters:**
```json
{
  "file": "binary",          // File buffer (required)
  "type": "string",          // "image" | "video" | "voice" | "document" (required)
  "conversationId": "string" // UUID of conversation (required)
}
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "url": "/media/images/2026/01/550e8400-e29b-41d4.jpg",
    "thumbnailUrl": "/media/images/2026/01/550e8400-e29b-41d4_thumb.jpg",
    "type": "image/jpeg",
    "size": 102400,
    "width": 1920,
    "height": 1080
  }
}
```

**Response Error (400/413):**
```json
{
  "success": false,
  "error": "File too large for image"
}
```

**File Limits:**
- Images: 10 MB (jpg, png, gif, webp)
- Videos: 50 MB (mp4, mov)
- Voice: 5 MB (m4a, mp3, ogg)
- Documents: 20 MB (pdf, doc, docx, txt)

**Storage:**
- Location: `./media/{type}/{YYYY}/{MM}/{UUID}{ext}`
- Thumbnails: Generated for images (300x300)
- URL Format: `/media/{type}/{year}/{month}/{filename}`

---

### 2. Get Conversations

**Endpoint:** `GET /api/conversations/:userId`

**Purpose:** Retrieve all conversations for a specific user

**URL Parameters:**
```
userId: string (UUID of user)
```

**Response Success (200):**
```json
[
  {
    "id": "conv-uuid-789",
    "is_group": false,
    "group_name": null,
    "group_avatar_url": null,
    "last_message_content": "Hello there!",
    "last_message_at": "2026-01-15T10:40:00Z",
    "last_message_sender_id": "user-uuid-123",
    "unread_count": 3,
    "other_usernames": "johndoe",
    "other_user_ids": "user-uuid-456"
  }
]
```

**Response Error (500):**
```json
{
  "error": "Failed to fetch conversations"
}
```

---

### 3. Get Conversation Details

**Endpoint:** `GET /api/chat/conversations/:conversationId`

**Purpose:** Retrieve full details of a specific conversation

**URL Parameters:**
```
conversationId: string (UUID of conversation)
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "id": "conv-uuid-789",
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-01-15T10:40:00Z",
    "last_message_at": "2026-01-15T10:40:00Z",
    "last_message_content": "Hello there!",
    "last_message_sender_id": "user-uuid-123",
    "is_group": false,
    "group_name": null,
    "group_avatar_url": null,
    "participants": [
      {
        "id": "part-uuid-001",
        "conversation_id": "conv-uuid-789",
        "user_id": "user-uuid-123",
        "joined_at": "2026-01-15T10:30:00Z",
        "last_read_at": "2026-01-15T10:40:00Z",
        "is_muted": false,
        "is_archived": false,
        "role": "member"
      }
    ]
  }
}
```

**Response Error (404):**
```json
{
  "error": "Conversation not found"
}
```

---

### 4. Search Messages

**Endpoint:** `GET /api/chat/conversations/:conversationId/search`

**Purpose:** Search messages in a conversation by text query

**URL Parameters:**
```
conversationId: string (UUID of conversation)
```

**Query Parameters:**
```
q: string (Search query, required)
```

**Request Example:**
```
GET /api/chat/conversations/conv-uuid-789/search?q=hello
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg-uuid-001",
        "conversation_id": "conv-uuid-789",
        "sender_id": "user-uuid-123",
        "body": "Hello there!",
        "type": "text",
        "created_at": "2026-01-15T10:35:00Z",
        "updated_at": "2026-01-15T10:35:00Z",
        "is_deleted": false,
        "media_url": null,
        "media_type": null
      }
    ],
    "total": 1
  }
}
```

**Response Error (400):**
```json
{
  "error": "Search query required"
}
```

---

### 5. Block/Unblock User

**Endpoint:** `POST /api/chat/block`

**Purpose:** Block or unblock a user from sending messages

**Request Body:**
```json
{
  "userId": "string",          // UUID of blocker (required)
  "targetUserId": "string",    // UUID of user to block (required)
  "action": "string"           // "block" | "unblock" (required)
}
```

**Response Success - Block (200):**
```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

**Response Success - Unblock (200):**
```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

**Response Error (400):**
```json
{
  "error": "User IDs required"
}
```

---

### 6. Archive Conversation

**Endpoint:** `POST /api/chat/conversations/:conversationId/archive`

**Purpose:** Archive or unarchive a conversation for a user

**URL Parameters:**
```
conversationId: string (UUID of conversation)
```

**Request Body:**
```json
{
  "userId": "string",       // UUID of user (required)
  "isArchived": "boolean"   // true to archive, false to unarchive (required)
}
```

**Response Success (200):**
```json
{
  "success": true
}
```

**Response Error (400):**
```json
{
  "error": "User ID required"
}
```

---

### 7. Delete Message

**Endpoint:** `POST /api/messages/:messageId/delete`

**Purpose:** Soft delete a message (marks as deleted, preserves history)

**URL Parameters:**
```
messageId: string (UUID of message)
```

**Request Body:**
```json
{
  "userId": "string"  // UUID of message sender (required)
}
```

**Response Success (200):**
```json
{
  "success": true
}
```

**Response Error (403):**
```json
{
  "error": "Not authorized to delete this message"
}
```

**Response Error (404):**
```json
{
  "error": "Message not found"
}
```

---

### 8. Add Reaction to Message

**Endpoint:** `POST /api/messages/:messageId/reactions`

**Purpose:** Add an emoji reaction to a message

**URL Parameters:**
```
messageId: string (UUID of message)
```

**Request Body:**
```json
{
  "userId": "string",  // UUID of reacting user (required)
  "emoji": "string"    // Emoji character: "👍", "❤️", etc. (required)
}
```

**Response Success (200):**
```json
{
  "success": true
}
```

**Response Error (400):**
```json
{
  "error": "User ID and emoji required"
}
```

---

### 9. Remove Reaction from Message

**Endpoint:** `DELETE /api/messages/:messageId/reactions/:emoji`

**Purpose:** Remove an emoji reaction from a message

**URL Parameters:**
```
messageId: string (UUID of message)
emoji: string (Emoji character)
```

**Request Body:**
```json
{
  "userId": "string"  // UUID of user removing reaction (required)
}
```

**Response Success (200):**
```json
{
  "success": true
}
```

**Response Error (400):**
```json
{
  "error": "User ID required"
}
```

---

## Message Operations

### Message Sending Schema

**Purpose:** Understanding how messages are structured when sending to another user

**Core Flow:**
1. Client emits `send_message` event via Socket.IO
2. Server validates authorization and saves message to database
3. Server broadcasts `new_message` to all participants in the conversation
4. Server sends `chat_list_update` notification to other users

**Message Data Structure:**
```json
{
  "id": "msg-uuid-123",
  "conversation_id": "conv-uuid-456",
  "sender_id": "user-uuid-789",
  "body": "Hello, how are you?",
  "type": "text",
  "created_at": "2026-01-15T10:45:00Z",
  "updated_at": "2026-01-15T10:45:00Z",
  "is_deleted": false,
  "reply_to_message_id": null,
  "media_url": null,
  "media_thumbnail_url": null,
  "media_type": null,
  "media_size_bytes": null,
  "media_duration_seconds": null,
  "media_width": null,
  "media_height": null,
  "metadata": null
}
```

**Database Schema (ripplevids_messages table):**
```sql
CREATE TABLE ripplevids_messages (
    id CHAR(36) PRIMARY KEY,
    conversation_id CHAR(36) NOT NULL,
    sender_id CHAR(36) NOT NULL,
    body TEXT,
    type VARCHAR(50) DEFAULT 'text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    reply_to_message_id CHAR(36),
    media_url TEXT,
    media_thumbnail_url TEXT,
    media_type VARCHAR(100),
    media_size_bytes BIGINT,
    media_duration_seconds INT,
    media_width INT,
    media_height INT,
    metadata JSON,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_message_id) REFERENCES ripplevids_messages(id) ON DELETE SET NULL
);
```

**Send Message Request (Socket.IO):**
```json
{
  "roomId": "conv-uuid-456",
  "senderId": "user-uuid-789",
  "body": "Hello, how are you?",
  "type": "text",
  "replyToMessageId": null
}
```

**Send Media Message Request:**
```json
{
  "roomId": "conv-uuid-456",
  "senderId": "user-uuid-789",
  "body": "Check this out!",
  "type": "image",
  "mediaUrl": "/media/images/2026/01/image.jpg",
  "mediaData": {
    "mimeType": "image/jpeg",
    "size": 102400,
    "width": 1920,
    "height": 1080
  },
  "replyToMessageId": null
}
```

**Response Events:**
- `new_message`: Broadcast to conversation room
- `chat_list_update`: Sent to other participants for UI updates

---

## Socket.IO Events

### Connection Management

#### CLIENT → SERVER: `register_user`

**Purpose:** Register user connection for real-time updates

**Emit:**
```javascript
socket.emit('register_user', userId)
```

**Parameters:**
```json
{
  "userId": "string" (UUID of user)
}
```

**Server Action:**
- Joins socket room `user:{userId}`
- Logs registration
- No immediate response emitted

**Example:**
```javascript
socket.emit('register_user', 'user-uuid-123');
```

---

#### CLIENT → SERVER: `join_chat`

**Purpose:** Join or create a 1-on-1 conversation

**Emit:**
```javascript
socket.emit('join_chat', { userId, targetUserId })
```

**Parameters:**
```json
{
  "userId": "string",       // UUID of current user (required)
  "targetUserId": "string"  // UUID of other user (required)
}
```

**Server Response: `room_joined`**
```javascript
socket.on('room_joined', (data) => {
  // {
  //   roomId: "conv-uuid-789",
  //   room: { id, created_at, updated_at, ... }
  // }
})
```

**Server Response: `message_history`**
```javascript
socket.on('message_history', (data) => {
  // {
  //   roomId: "conv-uuid-789",
  //   messages: [
  //     { id, sender_id, body, type, created_at, ... }
  //   ]
  // }
})
```

**Server Response on Error: `error`**
```javascript
socket.on('error', (error) => {
  // { message: "Missing user IDs" }
})
```

**Example:**
```javascript
socket.emit('join_chat', {
  userId: 'user-uuid-123',
  targetUserId: 'user-uuid-456'
});
```

---

### Message Events

#### CLIENT → SERVER: `send_message`

**Purpose:** Send a text message to a conversation

**Emit:**
```javascript
socket.emit('send_message', { roomId, senderId, body, type, replyToMessageId })
```

**Parameters:**
```json
{
  "roomId": "string",              // UUID of conversation (required)
  "senderId": "string",            // UUID of sender (required)
  "body": "string",                // Message text (required for type='text')
  "type": "string",                // "text" (default), "image", "video", etc. (optional)
  "replyToMessageId": "string"     // UUID of message being replied to (optional)
}
```

**Server Response: `new_message` (broadcast to room)**
```javascript
socket.on('new_message', (message) => {
  // {
  //   id: "msg-uuid-001",
  //   conversation_id: "conv-uuid-789",
  //   sender_id: "user-uuid-123",
  //   body: "Hello!",
  //   type: "text",
  //   created_at: "2026-01-15T10:35:00Z",
  //   reply_to_message_id: null
  // }
})
```

**Server Response: `chat_list_update` (broadcast to other participants)**
```javascript
socket.on('chat_list_update', (update) => {
  // {
  //   conversation_id: "conv-uuid-789",
  //   last_message: "Hello!",
  //   sender_id: "user-uuid-123",
  //   updated_at: "2026-01-15T10:35:00Z"
  // }
})
```

**Example:**
```javascript
socket.emit('send_message', {
  roomId: 'conv-uuid-789',
  senderId: 'user-uuid-123',
  body: 'Hello! How are you?',
  type: 'text'
});
```

---

#### CLIENT → SERVER: `send_media_message`

**Purpose:** Send a message with media (image, video, voice, document)

**Emit:**
```javascript
socket.emit('send_media_message', { roomId, senderId, body, type, mediaUrl, mediaData, replyToMessageId })
```

**Parameters:**
```json
{
  "roomId": "string",           // UUID of conversation (required)
  "senderId": "string",         // UUID of sender (required)
  "body": "string",             // Message caption (optional, defaults to '[Media]')
  "type": "string",             // "image" | "video" | "voice" | "document" (required)
  "mediaUrl": "string",         // URL returned from /api/chat/upload (required)
  "mediaData": {
    "mimeType": "string",       // MIME type: "image/jpeg", "video/mp4", etc.
    "size": "number",           // File size in bytes
    "width": "number",          // Image/video width (optional)
    "height": "number",         // Image/video height (optional)
    "duration": "number"        // Video/audio duration in seconds (optional)
  },
  "replyToMessageId": "string"  // UUID of message being replied to (optional)
}
```

**Server Response: `new_message` (broadcast to room)**
```javascript
socket.on('new_message', (message) => {
  // {
  //   id: "msg-uuid-001",
  //   conversation_id: "conv-uuid-789",
  //   sender_id: "user-uuid-123",
  //   body: "Check this out!",
  //   type: "image",
  //   media_url: "/media/images/2026/01/550e8400-e29b-41d4.jpg",
  //   media_type: "image/jpeg",
  //   created_at: "2026-01-15T10:35:00Z"
  // }
})
```

**Example:**
```javascript
socket.emit('send_media_message', {
  roomId: 'conv-uuid-789',
  senderId: 'user-uuid-123',
  body: 'Check out this photo!',
  type: 'image',
  mediaUrl: '/media/images/2026/01/550e8400-e29b-41d4.jpg',
  mediaData: {
    mimeType: 'image/jpeg',
    size: 102400,
    width: 1920,
    height: 1080
  }
});
```

---

#### CLIENT → SERVER: `fetch_messages`

**Purpose:** Fetch paginated message history (pagination)

**Emit:**
```javascript
socket.emit('fetch_messages', { roomId, limit, offset })
```

**Parameters:**
```json
{
  "roomId": "string",      // UUID of conversation (required)
  "limit": "number",       // Number of messages to fetch (default: 20, max: 100)
  "offset": "number"       // Number of messages to skip (default: 0)
}
```

**Server Response: `more_messages`**
```javascript
socket.on('more_messages', (data) => {
  // {
  //   roomId: "conv-uuid-789",
  //   messages: [
  //     { id, sender_id, body, type, created_at, media_url, ... }
  //   ],
  //   offset: 20,
  //   hasMore: true
  // }
})
```

**Example:**
```javascript
socket.emit('fetch_messages', {
  roomId: 'conv-uuid-789',
  limit: 50,
  offset: 0
});
```

---

#### CLIENT → SERVER: `get_conversations`

**Purpose:** Get all conversations for a user

**Emit:**
```javascript
socket.emit('get_conversations', { userId })
```

**Parameters:**
```json
{
  "userId": "string"  // UUID of user (required)
}
```

**Server Response: `conversations`**
```javascript
socket.on('conversations', (data) => {
  // {
  //   conversations: [
  //     {
  //       id: "conv-uuid-789",
  //       created_at: "2026-01-15T10:30:00Z",
  //       is_group: false,
  //       last_message_content: "Hello!",
  //       last_message_at: "2026-01-15T10:40:00Z",
  //       unread_count: 3,
  //       other_user_ids: "user-uuid-456"
  //     }
  //   ]
  // }
})
```

**Example:**
```javascript
socket.emit('get_conversations', {
  userId: 'user-uuid-123'
});
```

---

### Read Receipt Events

#### CLIENT → SERVER: `mark_as_read`

**Purpose:** Mark a message as read by a user

**Emit:**
```javascript
socket.emit('mark_as_read', { messageId, userId })
```

**Parameters:**
```json
{
  "messageId": "string",  // UUID of message (required)
  "userId": "string"      // UUID of reading user (required)
}
```

**Server Response: `message_read` (broadcast to room)**
```javascript
socket.on('message_read', (data) => {
  // {
  //   messageId: "msg-uuid-001",
  //   userId: "user-uuid-456",
  //   readAt: "2026-01-15T10:50:00Z"
  // }
})
```

**Example:**
```javascript
socket.emit('mark_as_read', {
  messageId: 'msg-uuid-001',
  userId: 'user-uuid-456'
});
```

---

### Typing Indicator Events

#### CLIENT → SERVER: `typing_start`

**Purpose:** Notify that a user is typing

**Emit:**
```javascript
socket.emit('typing_start', { roomId, userId })
```

**Parameters:**
```json
{
  "roomId": "string",  // UUID of conversation (required)
  "userId": "string"   // UUID of typing user (required)
}
```

**Server Response: `user_typing` (broadcast to room)**
```javascript
socket.on('user_typing', (data) => {
  // {
  //   userId: "user-uuid-123",
  //   roomId: "conv-uuid-789",
  //   isTyping: true
  // }
})
```

**Example:**
```javascript
socket.emit('typing_start', {
  roomId: 'conv-uuid-789',
  userId: 'user-uuid-123'
});
```

---

#### CLIENT → SERVER: `typing_stop`

**Purpose:** Notify that a user stopped typing

**Emit:**
```javascript
socket.emit('typing_stop', { roomId, userId })
```

**Parameters:**
```json
{
  "roomId": "string",  // UUID of conversation (required)
  "userId": "string"   // UUID of user (required)
}
```

**Server Response: `user_typing` (broadcast to room)**
```javascript
socket.on('user_typing', (data) => {
  // {
  //   userId: "user-uuid-123",
  //   roomId: "conv-uuid-789",
  //   isTyping: false
  // }
})
```

**Example:**
```javascript
socket.emit('typing_stop', {
  roomId: 'conv-uuid-789',
  userId: 'user-uuid-123'
});
```

---

### Message Management Events

#### CLIENT → SERVER: `delete_message`

**Purpose:** Soft delete a message (marks as deleted)

**Emit:**
```javascript
socket.emit('delete_message', { messageId, conversationId, userId })
```

**Parameters:**
```json
{
  "messageId": "string",      // UUID of message (required)
  "conversationId": "string", // UUID of conversation (required)
  "userId": "string"          // UUID of message sender (required)
}
```

**Server Response: `message_deleted` (broadcast to room)**
```javascript
socket.on('message_deleted', (data) => {
  // {
  //   messageId: "msg-uuid-001",
  //   conversationId: "conv-uuid-789"
  // }
})
```

**Example:**
```javascript
socket.emit('delete_message', {
  messageId: 'msg-uuid-001',
  conversationId: 'conv-uuid-789',
  userId: 'user-uuid-123'
});
```

---

### Reaction Events

#### CLIENT → SERVER: `add_reaction`

**Purpose:** Add an emoji reaction to a message

**Emit:**
```javascript
socket.emit('add_reaction', { messageId, conversationId, userId, emoji })
```

**Parameters:**
```json
{
  "messageId": "string",      // UUID of message (required)
  "conversationId": "string", // UUID of conversation (required)
  "userId": "string",         // UUID of reacting user (required)
  "emoji": "string"           // Emoji character: "👍", "❤️", etc. (required)
}
```

**Server Response: `message_reaction_added` (broadcast to room)**
```javascript
socket.on('message_reaction_added', (data) => {
  // {
  //   messageId: "msg-uuid-001",
  //   userId: "user-uuid-123",
  //   emoji: "👍"
  // }
})
```

**Example:**
```javascript
socket.emit('add_reaction', {
  messageId: 'msg-uuid-001',
  conversationId: 'conv-uuid-789',
  userId: 'user-uuid-123',
  emoji: '👍'
});
```

---

#### CLIENT → SERVER: `remove_reaction`

**Purpose:** Remove an emoji reaction from a message

**Emit:**
```javascript
socket.emit('remove_reaction', { messageId, conversationId, userId, emoji })
```

**Parameters:**
```json
{
  "messageId": "string",      // UUID of message (required)
  "conversationId": "string", // UUID of conversation (required)
  "userId": "string",         // UUID of user removing reaction (required)
  "emoji": "string"           // Emoji character (required)
}
```

**Server Response: `message_reaction_removed` (broadcast to room)**
```javascript
socket.on('message_reaction_removed', (data) => {
  // {
  //   messageId: "msg-uuid-001",
  //   userId: "user-uuid-123",
  //   emoji: "👍"
  // }
})
```

**Example:**
```javascript
socket.emit('remove_reaction', {
  messageId: 'msg-uuid-001',
  conversationId: 'conv-uuid-789',
  userId: 'user-uuid-123',
  emoji: '👍'
});
```

---

## Data Structures

### Conversation Object
```json
{
  "id": "string (UUID)",
  "created_at": "string (ISO 8601 timestamp)",
  "updated_at": "string (ISO 8601 timestamp)",
  "last_message_at": "string (ISO 8601 timestamp) | null",
  "last_message_content": "string | null",
  "last_message_sender_id": "string (UUID) | null",
  "is_group": "boolean",
  "group_name": "string | null",
  "group_avatar_url": "string (URL) | null"
}
```

### Message Object
```json
{
  "id": "string (UUID)",
  "conversation_id": "string (UUID)",
  "sender_id": "string (UUID)",
  "body": "string | null",
  "type": "string ('text' | 'image' | 'video' | 'voice' | 'document')",
  "created_at": "string (ISO 8601 timestamp)",
  "updated_at": "string (ISO 8601 timestamp)",
  "is_deleted": "boolean",
  "deleted_at": "string (ISO 8601 timestamp) | null",
  "reply_to_message_id": "string (UUID) | null",
  "media_url": "string (relative URL) | null",
  "media_thumbnail_url": "string (relative URL) | null",
  "media_type": "string (MIME type) | null",
  "media_size_bytes": "number | null",
  "media_duration_seconds": "number | null",
  "media_width": "number | null",
  "media_height": "number | null",
  "metadata": "object (JSON)"
}
```

### Participant Object
```json
{
  "id": "string (UUID)",
  "conversation_id": "string (UUID)",
  "user_id": "string (UUID)",
  "joined_at": "string (ISO 8601 timestamp)",
  "last_read_at": "string (ISO 8601 timestamp) | null",
  "is_muted": "boolean",
  "is_archived": "boolean",
  "role": "string ('admin' | 'member')"
}
```

### Reaction Object
```json
{
  "id": "string (UUID)",
  "message_id": "string (UUID)",
  "user_id": "string (UUID)",
  "emoji": "string",
  "created_at": "string (ISO 8601 timestamp)"
}
```

### Read Receipt Object
```json
{
  "id": "string (UUID)",
  "message_id": "string (UUID)",
  "user_id": "string (UUID)",
  "read_at": "string (ISO 8601 timestamp)"
}
```

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": "Description of what was invalid"
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "error": "Not authorized to perform this action"
}
```

#### 404 Not Found
```json
{
  "success": false,
  "error": "Resource not found"
}
```

#### 413 Payload Too Large
```json
{
  "success": false,
  "error": "File too large for image"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to process request"
}
```

### Socket.IO Errors

All Socket.IO errors are emitted as:
```javascript
socket.on('error', (error) => {
  // { message: "Error description" }
})
```

---

## URL Patterns

### Media Files
```
/media/images/{YYYY}/{MM}/{UUID}.{ext}
/media/images/{YYYY}/{MM}/{UUID}_thumb.{ext}
/media/videos/{YYYY}/{MM}/{UUID}.{ext}
/media/voice/{YYYY}/{MM}/{UUID}.{ext}
/media/documents/{YYYY}/{MM}/{UUID}.{ext}
```

### Examples
```
/media/images/2026/01/550e8400-e29b-41d4.jpg
/media/images/2026/01/550e8400-e29b-41d4_thumb.jpg
/media/videos/2026/01/660e8400-e29b-41d4.mp4
/media/voice/2026/01/770e8400-e29b-41d4.m4a
/media/documents/2026/01/990e8400-e29b-41d4.pdf
```

---

## Implementation Notes

### Media Upload Flow
1. Client calls `POST /api/chat/upload`
2. Server validates file (type, size, MIME)
3. Server saves to `./media/{type}/{YYYY}/{MM}/`
4. Server generates thumbnails (images only)
5. Server returns local URL `/media/{type}/{YYYY}/{MM}/{filename}`
6. Client sends message with URL via `send_media_message`
7. Server stores URL in database
8. Other clients retrieve messages with URL
9. Files directly accessible via Express static route

### Broadcasting Rules
- `new_message` → Broadcast to room (all participants)
- `chat_list_update` → Sent to other participants
- `message_read` → Broadcast to room
- `user_typing` → Broadcast to room
- `message_deleted` → Broadcast to room
- `message_reaction_added` → Broadcast to room
- `message_reaction_removed` → Broadcast to room

### Authorization
- User must be participant in conversation to send messages
- User must be sender of message to delete it
- Block checking prevents messaging between blocked users

### Soft Deletes
- Messages are marked `is_deleted = true` with `deleted_at` timestamp
- Original content is preserved in database
- Deleted messages can be restored if needed

---

## Quick Reference: Method Summary

### REST Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat/upload` | Upload media file |
| GET | `/api/conversations/:userId` | List conversations |
| GET | `/api/chat/conversations/:id` | Get conversation details |
| GET | `/api/chat/conversations/:id/search?q=` | Search messages |
| POST | `/api/chat/block` | Block/unblock user |
| POST | `/api/chat/conversations/:id/archive` | Archive conversation |
| POST | `/api/messages/:id/delete` | Delete message |
| POST | `/api/messages/:id/reactions` | Add reaction |
| DELETE | `/api/messages/:id/reactions/:emoji` | Remove reaction |

### Socket.IO Events (Client → Server)
| Event | Purpose |
|-------|---------|
| `register_user` | Register connection |
| `join_chat` | Join/create conversation |
| `send_message` | Send text message |
| `send_media_message` | Send message with media |
| `fetch_messages` | Get paginated messages |
| `get_conversations` | List conversations |
| `mark_as_read` | Mark message as read |
| `typing_start` | Start typing indicator |
| `typing_stop` | Stop typing indicator |
| `delete_message` | Soft delete message |
| `add_reaction` | Add emoji reaction |
| `remove_reaction` | Remove emoji reaction |

### Socket.IO Events (Server → Client)
| Event | Purpose |
|-------|---------|
| `room_joined` | Confirmation of joining room |
| `message_history` | Initial message batch |
| `more_messages` | Paginated messages |
| `new_message` | New message broadcast |
| `chat_list_update` | Conversation updated |
| `message_read` | Read receipt notification |
| `user_typing` | Typing indicator |
| `message_deleted` | Message deleted notification |
| `message_reaction_added` | Reaction added notification |
| `message_reaction_removed` | Reaction removed notification |
| `error` | Error notification |
| `conversations` | Conversation list |

---

**Document Version:** 1.0  
**Last Updated:** May 7, 2026  
**Status:** Complete and Ready for AI Consumption
