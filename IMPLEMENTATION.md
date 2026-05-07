# RippleVids Chat Server - Implementation Guide

This is the updated chat server implementation with full media support, message management, and real-time features.

## Recent Updates (from SERVER_UPDATE.md)

### ✅ Implemented Features

1. **Comprehensive Database Schema**
   - `conversations` - Main conversation table with metadata
   - `conversation_participants` - Participant tracking with roles and muting
   - `ripplevids_messages` - Enhanced messages with media support
   - `message_reads` - Read receipts tracking
   - `message_reactions` - Emoji reactions on messages
   - `blocked_users` - User blocking functionality

2. **Media Upload & Storage**
   - Local file storage with organized directory structure
   - Support for: Images, Videos, Voice messages, Documents
   - Automatic thumbnail generation for images
   - File size validation per type
   - Local URLs saved to database

3. **Socket.IO Real-time Events**
   - `register_user` - Register user connection
   - `join_chat` - Join or create 1-on-1 conversation
   - `send_message` - Send text messages
   - `send_media_message` - Send media with files
   - `fetch_messages` - Paginated message history
   - `get_conversations` - List all user conversations
   - `mark_as_read` - Message read receipts
   - `typing_start`/`typing_stop` - Typing indicators
   - `delete_message` - Soft delete messages
   - `add_reaction`/`remove_reaction` - Emoji reactions

4. **REST API Endpoints**
   - `POST /api/chat/upload` - Upload media files
   - `GET /api/conversations/:userId` - List conversations
   - `GET /api/chat/conversations/:conversationId` - Get conversation details
   - `GET /api/chat/conversations/:conversationId/search` - Search messages
   - `POST /api/chat/block` - Block/unblock users
   - `POST /api/chat/conversations/:conversationId/archive` - Archive conversations
   - `POST /api/messages/:messageId/delete` - Delete messages
   - `POST /api/messages/:messageId/reactions` - Add reactions
   - `DELETE /api/messages/:messageId/reactions/:emoji` - Remove reactions

## Media Storage Structure

All media files are stored locally in the `/media` directory with the following structure:

```
media/
├── images/
│   ├── 2026/
│   │   ├── 01/
│   │   │   ├── {uuid}.jpg
│   │   │   └── {uuid}_thumb.jpg
│   │   └── 02/
│   │       └── ...
│   └── 2027/
├── videos/
│   ├── 2026/
│   │   ├── 01/
│   │   │   ├── {uuid}.mp4
│   │   │   └── {uuid}_thumb.jpg
│   │   └── ...
├── voice/
│   ├── 2026/
│   │   ├── 01/
│   │   │   └── {uuid}.m4a
│   │   └── ...
└── documents/
    ├── 2026/
    │   ├── 01/
    │   │   └── {uuid}.pdf
    │   └── ...
```

### Storage Locations

| Type      | Directory       | Max Size   | Formats                              |
|-----------|-----------------|------------|--------------------------------------|
| Images    | `media/images/` | 10 MB      | jpg, png, gif, webp                  |
| Videos    | `media/videos/` | 50 MB      | mp4, mov                             |
| Voice     | `media/voice/`  | 5 MB       | m4a, mp3, ogg                        |
| Documents | `media/documents/` | 20 MB   | pdf, doc, docx, txt                  |

## Local URL Format

All uploaded files are accessible via the `/media` route using the following format:

```
/media/{type}/{year}/{month}/{filename}
```

### Examples
- Image: `/media/images/2026/01/550e8400-e29b-41d4-a716-446655440000.jpg`
- Thumbnail: `/media/images/2026/01/550e8400-e29b-41d4-a716-446655440000_thumb.jpg`
- Video: `/media/videos/2026/01/550e8400-e29b-41d4-a716-446655440000.mp4`
- Voice: `/media/voice/2026/01/550e8400-e29b-41d4-a716-446655440000.m4a`
- Document: `/media/documents/2026/01/550e8400-e29b-41d4-a716-446655440000.pdf`

## Database Storage of URLs

When a file is uploaded via `/api/chat/upload`, the response includes the local URL which is then:

1. **Sent to client** in the response
2. **Stored in database** when the client sends a message with media

### Message Fields for Media

The `ripplevids_messages` table stores:
- `media_url` - Local URL to the media file
- `media_type` - MIME type (e.g., "image/jpeg", "video/mp4")
- `media_thumbnail_url` - URL to thumbnail (for images)
- `media_size_bytes` - File size in bytes
- `media_duration_seconds` - Duration (for video/voice)
- `media_width` - Image/video width
- `media_height` - Image/video height
- `metadata` - JSON object with additional data

## File Upload Flow

### Client Perspective
1. Client calls `POST /api/chat/upload` with file
2. Server processes file and returns:
   ```json
   {
     "success": true,
     "data": {
       "url": "/media/images/2026/01/uuid.jpg",
       "thumbnailUrl": "/media/images/2026/01/uuid_thumb.jpg",
       "type": "image/jpeg",
       "size": 102400,
       "width": 1920,
       "height": 1080
     }
   }
   ```
3. Client emits `send_media_message` event with URL
4. Server saves message with media URL to database
5. Message with media is broadcast to room

### Database Flow
1. File is saved to disk at `media/{type}/{year}/{month}/{filename}`
2. Local URL is returned to client
3. When message is sent, URL is stored in `media_url` field
4. Other clients fetch messages and receive the URL
5. They can directly access the file via the static `/media` route

## Running the Server

### Setup
```bash
# Install dependencies
npm install

# Create .env file with database credentials
cp .env.example .env

# Update .env with your MySQL credentials
# DATABASE_URL, MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_PORT

# Run database migrations
mysql -u root -p < schema.sql

# Start server
npm start
```

### Development
```bash
# Run with nodemon (auto-restart on changes)
npm run dev
```

### Port
Server runs on `PORT` (default: 3904) from environment variable

## API Examples

### Upload Image
```bash
curl -X POST http://localhost:3904/api/chat/upload \
  -F "file=@image.jpg" \
  -F "type=image" \
  -F "conversationId=conv-uuid"
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "/media/images/2026/01/uuid.jpg",
    "thumbnailUrl": "/media/images/2026/01/uuid_thumb.jpg",
    "type": "image/jpeg",
    "size": 102400,
    "width": 1920,
    "height": 1080
  }
}
```

### Send Message with Media
```javascript
socket.emit('send_media_message', {
  roomId: 'conversation-uuid',
  senderId: 'user-uuid',
  body: 'Check out this photo!',
  type: 'image',
  mediaUrl: '/media/images/2026/01/uuid.jpg',
  mediaData: {
    mimeType: 'image/jpeg',
    size: 102400,
    width: 1920,
    height: 1080
  }
});
```

### Get Messages with Media
```javascript
socket.emit('fetch_messages', {
  roomId: 'conversation-uuid',
  limit: 20,
  offset: 0
});

// Response includes messages with media_url fields
socket.on('more_messages', (data) => {
  data.messages.forEach(msg => {
    if (msg.media_url) {
      console.log('Media URL:', msg.media_url);
    }
  });
});
```

## Security Considerations

1. **File Upload Validation**
   - MIME type checking
   - File size limits per type
   - Allowed file extensions validation

2. **Authorization**
   - User must be participant in conversation to send messages
   - Soft deletes preserve message history
   - Block checking prevents messaging

3. **Rate Limiting**
   - Configure express rate limiter for upload endpoint
   - Implement per-user upload quotas

4. **File Serving**
   - Static files served via Express `/media` route
   - Consider CDN for production (CloudFront, Cloudflare)
   - Set proper cache headers

## Production Recommendations

1. **CDN Integration**
   - Use CloudFront/Cloudflare for media delivery
   - Set cache control headers: `public, max-age=31536000`

2. **Transcoding**
   - Implement video transcoding (H.264) for consistency
   - Extract actual duration from videos
   - Generate waveforms for voice messages

3. **Database Optimization**
   - Add database indexes (already in schema)
   - Set up regular backups
   - Archive old messages

4. **Monitoring**
   - Track upload success rates
   - Monitor storage usage
   - Log file operations

5. **Error Handling**
   - Implement retry logic for failed uploads
   - Clean up partial uploads
   - Provide meaningful error messages to client

## Troubleshooting

### Media Not Saving
- Check `/media` directory permissions
- Verify disk space available
- Check file size limits in multer config

### URLs Not Working
- Ensure `/media` static route is configured
- Verify files were created in correct directory
- Check browser console for 404 errors

### Database Errors
- Ensure `conversations` table migration was run
- Check `conversation_id` foreign keys
- Verify `media_url` column exists

## Next Steps

1. Implement Redis for presence tracking
2. Add message search with full-text indexes
3. Implement group conversations
4. Add voice/video call support
5. Implement end-to-end encryption
