# Testing Guide - Chat Server Implementation

This guide provides step-by-step instructions to test all features of the updated chat server.

## Prerequisites

```bash
# 1. Database setup
mysql -u root -p < schema.sql

# 2. Install dependencies
npm install

# 3. Start server
npm start
# Server running on http://localhost:3904
```

## Test 1: Basic Connection & Registration

### Test Socket.IO Connection
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3904');

socket.on('connect', () => {
  console.log('✓ Connected to server');
  
  // Register user
  socket.emit('register_user', 'user-uuid-123');
  
  console.log('✓ User registered');
});

socket.on('error', (error) => {
  console.error('✗ Error:', error);
});
```

## Test 2: Create Conversation & Send Message

### Test join_chat Event
```javascript
socket.on('room_joined', (data) => {
  console.log('✓ Room joined:', data.roomId);
  console.log('✓ Conversation:', data.room);
});

// Join chat with another user
socket.emit('join_chat', {
  userId: 'user-uuid-123',
  targetUserId: 'user-uuid-456'
});

// Wait for room_joined response
```

### Expected Response
```javascript
{
  roomId: 'conv-uuid-789',
  room: {
    id: 'conv-uuid-789',
    created_at: '2026-01-15T10:30:00Z',
    is_group: false,
    ...
  }
}
```

## Test 3: Message History

### Test fetch_messages Event
```javascript
socket.on('message_history', (data) => {
  console.log('✓ Initial messages loaded:', data.messages.length);
  data.messages.forEach(msg => {
    console.log(`  - [${msg.sender_id}]: ${msg.body}`);
  });
});

// After joining a room (room_joined received)
socket.emit('fetch_messages', {
  roomId: 'conv-uuid-789',
  limit: 20,
  offset: 0
});
```

## Test 4: Send Text Message

### Test send_message Event
```javascript
socket.on('new_message', (message) => {
  console.log('✓ Message received:', message);
  console.log(`  ID: ${message.id}`);
  console.log(`  Sender: ${message.sender_id}`);
  console.log(`  Body: ${message.body}`);
  console.log(`  Created: ${message.created_at}`);
});

// Send text message
socket.emit('send_message', {
  roomId: 'conv-uuid-789',
  senderId: 'user-uuid-123',
  body: 'Hello! This is a test message',
  type: 'text',
  replyToMessageId: null
});
```

### Expected Output
```
✓ Message received: {
  id: 'msg-uuid-001',
  conversation_id: 'conv-uuid-789',
  sender_id: 'user-uuid-123',
  body: 'Hello! This is a test message',
  type: 'text',
  created_at: 2026-01-15T10:35:00Z,
  reply_to_message_id: null
}
```

## Test 5: Media Upload (Images)

### Using curl
```bash
# Create test directory
mkdir test_media

# Create sample image (using ImageMagick or download one)
# For testing, you can use any valid image file

# Upload image
curl -X POST http://localhost:3904/api/chat/upload \
  -F "file=@test_media/sample.jpg" \
  -F "type=image" \
  -F "conversationId=conv-uuid-789"
```

### Expected Response
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

### Verify File Saved
```bash
# Check if directory was created
ls -la ./media/images/2026/01/

# Should show:
# 550e8400-e29b-41d4.jpg
# 550e8400-e29b-41d4_thumb.jpg
```

## Test 6: Send Message with Media

### Test send_media_message Event
```javascript
socket.on('new_message', (message) => {
  console.log('✓ Media message received:', message);
  console.log(`  Type: ${message.type}`);
  console.log(`  Media URL: ${message.media_url}`);
  console.log(`  Media Type: ${message.media_type}`);
});

// Send image message
socket.emit('send_media_message', {
  roomId: 'conv-uuid-789',
  senderId: 'user-uuid-123',
  body: 'Check out this image!',
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

### Expected Output
```
✓ Media message received: {
  id: 'msg-uuid-002',
  conversation_id: 'conv-uuid-789',
  sender_id: 'user-uuid-123',
  body: 'Check out this image!',
  type: 'image',
  media_url: '/media/images/2026/01/550e8400-e29b-41d4.jpg',
  media_type: 'image/jpeg',
  created_at: 2026-01-15T10:40:00Z
}
```

## Test 7: Fetch Messages with Media

### Test More Messages with Media
```javascript
socket.on('more_messages', (data) => {
  console.log('✓ Messages loaded:', data.messages.length);
  console.log('  Has more:', data.hasMore);
  
  data.messages.forEach(msg => {
    if (msg.media_url) {
      console.log(`✓ Media message: ${msg.media_url}`);
    }
  });
});

socket.emit('fetch_messages', {
  roomId: 'conv-uuid-789',
  limit: 20,
  offset: 0
});
```

## Test 8: Message Read Receipts

### Test mark_as_read Event
```javascript
socket.on('message_read', (data) => {
  console.log('✓ Read receipt received:');
  console.log(`  Message ID: ${data.messageId}`);
  console.log(`  User: ${data.userId}`);
  console.log(`  Read at: ${data.readAt}`);
});

// Mark specific message as read
socket.emit('mark_as_read', {
  messageId: 'msg-uuid-001',
  userId: 'user-uuid-456'
});
```

## Test 9: Typing Indicators

### Test Typing Events
```javascript
socket.on('user_typing', (data) => {
  if (data.isTyping) {
    console.log(`✓ ${data.userId} is typing...`);
  } else {
    console.log(`✓ ${data.userId} stopped typing`);
  }
});

// User starts typing
socket.emit('typing_start', {
  roomId: 'conv-uuid-789',
  userId: 'user-uuid-123'
});

// Simulate typing delay
setTimeout(() => {
  socket.emit('typing_stop', {
    roomId: 'conv-uuid-789',
    userId: 'user-uuid-123'
  });
}, 3000);
```

## Test 10: Message Reactions

### Test add_reaction Event
```javascript
socket.on('message_reaction_added', (data) => {
  console.log('✓ Reaction added:');
  console.log(`  Message: ${data.messageId}`);
  console.log(`  User: ${data.userId}`);
  console.log(`  Emoji: ${data.emoji}`);
});

// Add emoji reaction
socket.emit('add_reaction', {
  messageId: 'msg-uuid-001',
  conversationId: 'conv-uuid-789',
  userId: 'user-uuid-123',
  emoji: '👍'
});
```

### Test remove_reaction Event
```javascript
socket.on('message_reaction_removed', (data) => {
  console.log('✓ Reaction removed:');
  console.log(`  Message: ${data.messageId}`);
  console.log(`  User: ${data.userId}`);
  console.log(`  Emoji: ${data.emoji}`);
});

// Remove reaction
socket.emit('remove_reaction', {
  messageId: 'msg-uuid-001',
  conversationId: 'conv-uuid-789',
  userId: 'user-uuid-123',
  emoji: '👍'
});
```

## Test 11: Message Deletion

### Test delete_message Event
```javascript
socket.on('message_deleted', (data) => {
  console.log('✓ Message deleted:');
  console.log(`  Message ID: ${data.messageId}`);
  console.log(`  Conversation: ${data.conversationId}`);
});

// Delete a message
socket.emit('delete_message', {
  messageId: 'msg-uuid-001',
  conversationId: 'conv-uuid-789',
  userId: 'user-uuid-123'
});
```

## Test 12: Get All Conversations

### Test get_conversations Event
```javascript
socket.on('conversations', (data) => {
  console.log('✓ Conversations loaded:', data.conversations.length);
  
  data.conversations.forEach(conv => {
    console.log(`  - ${conv.id}`);
    console.log(`    Last message: ${conv.last_message_content}`);
    console.log(`    Unread: ${conv.unread_count}`);
  });
});

// Get user's conversations
socket.emit('get_conversations', {
  userId: 'user-uuid-123'
});
```

## Test 13: Block/Unblock User

### Using REST API
```bash
# Block a user
curl -X POST http://localhost:3904/api/chat/block \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid-123",
    "targetUserId": "user-uuid-999",
    "action": "block"
  }'

# Expected response
# {
#   "success": true,
#   "message": "User blocked successfully"
# }

# Unblock user
curl -X POST http://localhost:3904/api/chat/block \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid-123",
    "targetUserId": "user-uuid-999",
    "action": "unblock"
  }'
```

## Test 14: Archive Conversation

### Using REST API
```bash
# Archive conversation
curl -X POST http://localhost:3904/api/chat/conversations/conv-uuid-789/archive \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid-123",
    "isArchived": true
  }'

# Expected response
# { "success": true }

# Unarchive
curl -X POST http://localhost:3904/api/chat/conversations/conv-uuid-789/archive \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid-123",
    "isArchived": false
  }'
```

## Test 15: Search Messages

### Using REST API
```bash
curl -X GET "http://localhost:3904/api/chat/conversations/conv-uuid-789/search?q=hello" \
  -H "Content-Type: application/json"

# Expected response
# {
#   "success": true,
#   "data": {
#     "messages": [
#       {
#         "id": "msg-uuid-001",
#         "body": "Hello! This is a test message",
#         ...
#       }
#     ],
#     "total": 1
#   }
# }
```

## Test 16: Get Conversation Details

### Using REST API
```bash
curl -X GET http://localhost:3904/api/chat/conversations/conv-uuid-789 \
  -H "Content-Type: application/json"

# Expected response
# {
#   "success": true,
#   "data": {
#     "id": "conv-uuid-789",
#     "created_at": "2026-01-15T10:30:00Z",
#     "is_group": false,
#     "participants": [...]
#   }
# }
```

## Test 17: Video Upload

### Using curl
```bash
# Upload video (must be valid video file)
curl -X POST http://localhost:3904/api/chat/upload \
  -F "file=@test_media/sample.mp4" \
  -F "type=video" \
  -F "conversationId=conv-uuid-789"

# Expected response includes video URL and thumbnail
```

## Test 18: Voice Message Upload

### Using curl
```bash
# Upload voice message
curl -X POST http://localhost:3904/api/chat/upload \
  -F "file=@test_media/voice.m4a" \
  -F "type=voice" \
  -F "conversationId=conv-uuid-789"

# Expected response includes voice URL
```

## Test 19: Document Upload

### Using curl
```bash
# Upload document
curl -X POST http://localhost:3904/api/chat/upload \
  -F "file=@test_media/document.pdf" \
  -F "type=document" \
  -F "conversationId=conv-uuid-789"

# Expected response includes document URL
```

## Test 20: Error Handling

### Test Invalid User
```javascript
socket.emit('join_chat', {
  userId: null,
  targetUserId: 'user-uuid-456'
});

socket.on('error', (error) => {
  console.log('✓ Error caught:', error.message);
  // Should output: "Missing user IDs"
});
```

### Test Oversized File
```bash
# Create a large file (>10MB for image)
dd if=/dev/zero of=large.jpg bs=1M count=15

# Try to upload
curl -X POST http://localhost:3904/api/chat/upload \
  -F "file=@large.jpg" \
  -F "type=image" \
  -F "conversationId=conv-uuid-789"

# Expected response
# {
#   "success": false,
#   "error": "File too large for image"
# }
```

## Verification Checklist

- [ ] Database tables created successfully
- [ ] Files saved to `/media/` directory
- [ ] Thumbnails generated for images
- [ ] Local URLs returned in API responses
- [ ] URLs stored in database `media_url` field
- [ ] Socket events broadcast correctly
- [ ] Error handling works
- [ ] File size validation works
- [ ] MIME type validation works
- [ ] Search functionality returns results
- [ ] Read receipts tracked
- [ ] Reactions working
- [ ] Typing indicators broadcast
- [ ] Message deletion marks as deleted
- [ ] Blocking prevents messaging
- [ ] Archiving hides conversations
- [ ] Multiple message types supported

## Troubleshooting

### No files in `/media` directory
- Check server logs for errors
- Verify write permissions: `chmod 755 ./media`
- Check disk space: `df -h`

### Database connection errors
- Verify MySQL is running
- Check `.env` credentials
- Run schema.sql: `mysql -u root -p < schema.sql`

### Socket.IO not connecting
- Check firewall settings
- Verify port 3904 is open
- Check server console for connection errors

### Files not retrieving correctly
- Verify `/media` route is configured
- Check file exists in directory
- Check browser console for 404 errors
