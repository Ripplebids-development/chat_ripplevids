# System Architecture & Data Flow

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Native Client                      │
│                      (Mobile App / Web)                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   Socket.IO    REST API      REST API
   (Real-time)  (Upload)      (Other)
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────▼────────────┐
        │    Node.js Server       │
        │    (Express + Socket)   │
        │                         │
        │  - Route Handlers       │
        │  - Socket Events        │
        │  - File Upload          │
        │  - Validation           │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   ┌─────────────┐          ┌──────────────┐
   │   MySQL     │          │ Local Disk   │
   │  Database   │          │   Storage    │
   │             │          │              │
   │ - Messages  │          │ /media/      │
   │ - Users     │          │   ├─ images/ │
   │ - Reactions │          │   ├─ videos/ │
   │ - Reads     │          │   ├─ voice/  │
   │ - Blocks    │          │   └─ docs/   │
   └─────────────┘          └──────────────┘
```

## 🔄 Message with Media Flow

### Sequence 1: Upload Media File

```
Client                Server              Disk Storage       Database
  │                      │                     │                  │
  │─ POST /upload ─────▶ │                     │                  │
  │  (file + metadata)   │                     │                  │
  │                      │─ Validate ─────────▶│                  │
  │                      │  (type, size)       │                  │
  │                      │◀─ OK ───────────────│                  │
  │                      │                     │                  │
  │                      │─ Save file ────────▶│                  │
  │                      │  (UUID + date path) │                  │
  │                      │◀─ Saved ───────────│                  │
  │                      │                     │                  │
  │◀─ URL response ─────│                     │                  │
  │  {url: /media/...}  │                     │                  │
  │                     │                     │                  │
```

**Response Example:**
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

### Sequence 2: Send Message with Media

```
Client                Server           Database            Other Clients
  │                      │                  │                   │
  │─ send_media_msg ───▶ │                  │                   │
  │  {url, type, meta}   │                  │                   │
  │                      │─ Validate ──────▶│                   │
  │                      │  (user in conv)  │                   │
  │                      │                  │                   │
  │                      │─ Save message ──▶│                   │
  │                      │  (with media_url)│                   │
  │                      │◀─ Saved ────────│                   │
  │                      │                  │                   │
  │                      │─ Broadcast ──────────────▶ new_msg ─▶│
  │                      │  (with media URL)        {url, ...}  │
  │                      │                                       │
  │◀─ Confirmation ─────│                  │                   │
  │                     │                  │                   │
```

### Sequence 3: Retrieve Messages

```
Other Client          Server           Database           Disk Storage
  │                      │                  │                   │
  │─ fetch_messages ───▶ │                  │                   │
  │                      │─ Query ─────────▶│                   │
  │                      │  {conversation} │                   │
  │                      │◀─ Rows ────────│                   │
  │                      │  (with media_url) │                   │
  │                      │                  │                   │
  │◀─ more_messages ───│                  │                   │
  │  [{id, url, ...}]  │                  │                   │
  │                      │                  │                   │
  │─ GET /media/... ────────────────────────────────▶ File ────▶│
  │                      │                  │                   │
  │◀─ File content ─────────────────────────────────│          │
  │                     │                  │                   │
```

## 📁 Media Storage Organization

### Directory Tree Example

```
./media/
│
├── images/
│   ├── 2026/
│   │   ├── 01/
│   │   │   ├── 550e8400-e29b-41d4.jpg          (original image)
│   │   │   ├── 550e8400-e29b-41d4_thumb.jpg    (thumbnail)
│   │   │   ├── a1b2c3d4-e5f6-47d8.jpg
│   │   │   └── a1b2c3d4-e5f6-47d8_thumb.jpg
│   │   ├── 02/
│   │   │   ├── b7c8d9e0-f1a2-43b4.jpg
│   │   │   └── ...
│   │   └── 03/
│   │       └── ...
│   └── 2027/
│       └── ...
│
├── videos/
│   ├── 2026/
│   │   ├── 01/
│   │   │   ├── 660e8400-e29b-41d4.mp4          (video file)
│   │   │   └── 660e8400-e29b-41d4_thumb.jpg    (first frame)
│   │   └── ...
│   └── 2027/
│       └── ...
│
├── voice/
│   ├── 2026/
│   │   ├── 01/
│   │   │   ├── 770e8400-e29b-41d4.m4a
│   │   │   └── 880e8400-e29b-41d4.mp3
│   │   └── ...
│   └── 2027/
│       └── ...
│
└── documents/
    ├── 2026/
    │   ├── 01/
    │   │   ├── 990e8400-e29b-41d4.pdf
    │   │   └── aa0e8400-e29b-41d4.docx
    │   └── ...
    └── 2027/
        └── ...
```

## 🗄️ Database Schema Diagram

### Messages Table with Media Fields

```
ripplevids_messages
┌──────────────────────────────────────────────────┐
│ id (UUID)                                         │
│ conversation_id (FK) ──────────────┐             │
│ sender_id (UUID)                   │             │
│ body (TEXT)                        │             │
│ type (varchar) - text/image/video  │             │
│ created_at (TIMESTAMP)             │             │
│ is_deleted (BOOLEAN)               │             │
│ deleted_at (TIMESTAMP)             │             │
│ reply_to_message_id (FK)          │             │
│                                    │             │
│ ⭐ MEDIA FIELDS:                  │             │
│ media_url ◄──────────────────┐    │ ┌───────────┼──────────────┐
│   /media/images/2026/01/...  │    │ │           │              │
│ media_thumbnail_url           │    │ │ Conversns │ Local Disk   │
│ media_type (image/jpeg, etc)  │    │ │ (storage) │ Storage      │
│ media_size_bytes             │    │ │           │ /media/      │
│ media_duration_seconds       │    │ │           │              │
│ media_width                  │    │ │           │ Files saved  │
│ media_height                 │    │ │           │ by type &    │
│ metadata (JSON)              │    │ │           │ date         │
└──────────────────────────────────┘    │           │              │
                                         └───────────┴──────────────┘
```

### Related Tables

```
conversations
├── id (PK)
├── created_at
├── is_group
├── last_message_content
├── last_message_at
└── last_message_sender_id

conversation_participants
├── id (PK)
├── conversation_id (FK)
├── user_id
├── joined_at
├── last_read_at
├── is_archived
└── role

message_reads
├── id (PK)
├── message_id (FK) ──→ ripplevids_messages.id
├── user_id
└── read_at

message_reactions
├── id (PK)
├── message_id (FK) ──→ ripplevids_messages.id
├── user_id
├── emoji
└── created_at

blocked_users
├── id (PK)
├── blocker_id
├── blocked_id
└── created_at
```

## 🔗 API Request/Response Examples

### Upload Request
```
POST /api/chat/upload HTTP/1.1
Content-Type: multipart/form-data

file: [binary]
type: image
conversationId: 12345-67890
```

### Upload Response
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

### Send Media Message (Socket.IO)
```javascript
socket.emit('send_media_message', {
  roomId: 'conv-uuid',
  senderId: 'user-uuid',
  body: 'Check this out!',
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

### Receive Message (Socket.IO)
```javascript
socket.on('new_message', (message) => {
  console.log(message);
  // {
  //   id: 'msg-uuid',
  //   conversation_id: 'conv-uuid',
  //   sender_id: 'user-uuid',
  //   body: 'Check this out!',
  //   type: 'image',
  //   media_url: '/media/images/2026/01/550e8400-e29b-41d4.jpg',
  //   created_at: timestamp
  // }
});
```

## 📝 Configuration Files

### .env.example
```bash
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=ripplevids
MYSQL_PORT=3306
PORT=3904
NODE_ENV=development
MEDIA_BASE_PATH=./media
MAX_UPLOAD_SIZE_MB=50
```

## ✅ Validation & Security

### File Upload Validation
```
┌─ Upload Request ──────┐
│ file + type + convId  │
└──────────┬────────────┘
           │
      ┌────▼────┐
      │ Validate │
      ├──────────┤
      │ Type?    │ ✗ → Error
      │ Size?    │ ✗ → Error
      │ Mimetype?│ ✗ → Error
      │ User OK? │ ✗ → Error
      └────┬─────┘
           │ ✓
      ┌────▼─────────┐
      │ Save to Disk │
      │ Generate     │
      │ Thumbnails   │
      └────┬─────────┘
           │
      ┌────▼────────┐
      │ Return URL  │
      │ to Client   │
      └─────────────┘
```

## 🎯 Key Design Decisions

1. **Local Storage**: Files saved locally with date-based directory structure
2. **UUID Filenames**: Prevents name collisions and security issues
3. **Relative URLs**: `/media/type/year/month/file` stored in database
4. **Soft Deletes**: Messages marked deleted but not removed (preserves history)
5. **Read Receipts**: Separate table for scalability
6. **Thumbnails**: Automatic for images, pre-generated
7. **Static Serving**: Express serves media directly (CDN-ready for production)

## 🚀 Future Improvements

1. **CDN Integration**: Offload `/media` to CloudFront/Cloudflare
2. **S3 Storage**: Move large files to cloud storage
3. **Transcoding**: Process videos on upload
4. **Compression**: Optimize images and videos
5. **Archival**: Move old files to cold storage
6. **Encryption**: End-to-end encryption for messages
7. **Caching**: Redis cache for frequently accessed media
