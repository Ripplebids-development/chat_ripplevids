# Media Storage System - Complete Guide

## 📁 Directory Structure

The media storage system is automatically created on the server with this structure:

```
./media/                                    (Auto-created on first upload)
│
├── images/                                 (Images: JPG, PNG, GIF, WebP)
│   └── 2026/
│       └── 01/                            (Month: 01-12)
│           ├── 550e8400-e29b-41d4.jpg     (Original image)
│           ├── 550e8400-e29b-41d4_thumb.jpg (Thumbnail: 300x300)
│           ├── a1b2c3d4-e5f6-47d8.jpg
│           └── a1b2c3d4-e5f6-47d8_thumb.jpg
│
├── videos/                                 (Videos: MP4, MOV)
│   └── 2026/
│       └── 01/
│           ├── 660e8400-e29b-41d4.mp4     (Video file)
│           └── 660e8400-e29b-41d4_thumb.jpg (First frame)
│
├── voice/                                  (Audio: M4A, MP3, OGG)
│   └── 2026/
│       └── 01/
│           ├── 770e8400-e29b-41d4.m4a
│           └── 880e8400-e29b-41d4.mp3
│
└── documents/                              (Documents: PDF, DOC, DOCX, TXT)
    └── 2026/
        └── 01/
            ├── 990e8400-e29b-41d4.pdf
            └── aa0e8400-e29b-41d4.docx
```

## 📤 File Upload Process

### Step-by-Step

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIENT UPLOADS FILE                                      │
│    POST /api/chat/upload                                    │
│    Headers: multipart/form-data                            │
│    Body:                                                    │
│    - file: binary data                                      │
│    - type: "image" | "video" | "voice" | "document"        │
│    - conversationId: "conv-uuid-123"                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. SERVER VALIDATES                                         │
│    - Check MIME type matches "type" parameter              │
│    - Check file size ≤ allowed limit                       │
│    - Check file extension is whitelisted                   │
│    Result: ✓ or ✗ error response                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CREATE DIRECTORY STRUCTURE                              │
│    Directory: ./media/{type}/{YYYY}/{MM}/                  │
│    Example: ./media/images/2026/01/                        │
│    Creates if doesn't exist                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. GENERATE UNIQUE FILENAME                                 │
│    Filename: {UUID}{extension}                             │
│    Example: 550e8400-e29b-41d4.jpg                        │
│    UUID prevents collisions                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SAVE FILE TO DISK                                        │
│    Path: ./media/images/2026/01/550e8400-e29b-41d4.jpg    │
│    Write buffer to file system                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. POST-PROCESSING (TYPE-SPECIFIC)                          │
│                                                             │
│    IF type = "image":                                       │
│      - Generate thumbnail (300x300)                        │
│      - Extract width, height, metadata                     │
│                                                             │
│    IF type = "video":                                       │
│      - Extract duration (not yet implemented)              │
│      - Generate first-frame thumbnail                      │
│                                                             │
│    IF type = "voice" or "document":                        │
│      - No post-processing (pass-through)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. PREPARE RESPONSE                                         │
│    Build URL: /media/{type}/{YYYY}/{MM}/{filename}        │
│    Example: /media/images/2026/01/550e8400-e29b-41d4.jpg  │
│    Include metadata (size, dimensions, etc)               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. SEND RESPONSE TO CLIENT                                  │
│    {                                                        │
│      "success": true,                                       │
│      "data": {                                              │
│        "url": "/media/images/2026/01/550e8400...",        │
│        "thumbnailUrl": "/media/images/2026/01/..._thumb.jpg",│
│        "type": "image/jpeg",                              │
│        "size": 102400,                                      │
│        "width": 1920,                                       │
│        "height": 1080                                       │
│      }                                                      │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
```

## 💾 File Type Specifications

| Type | Location | Max Size | Formats | Processing |
|------|----------|----------|---------|------------|
| **Images** | `/media/images/` | 10 MB | jpg, png, gif, webp | Thumbnail: 300x300, Extract dimensions |
| **Videos** | `/media/videos/` | 50 MB | mp4, mov | Extract duration, First-frame thumbnail |
| **Voice** | `/media/voice/` | 5 MB | m4a, mp3, ogg | No processing |
| **Documents** | `/media/documents/` | 20 MB | pdf, doc, docx, txt | No processing |

## 🔗 URL Patterns

### Image URL
```
/media/images/{year}/{month}/{uuid}.{ext}
/media/images/2026/01/550e8400-e29b-41d4.jpg
```

### Image Thumbnail URL
```
/media/images/{year}/{month}/{uuid}_thumb.{ext}
/media/images/2026/01/550e8400-e29b-41d4_thumb.jpg
```

### Video URL
```
/media/videos/{year}/{month}/{uuid}.{ext}
/media/videos/2026/01/660e8400-e29b-41d4.mp4
```

### Voice URL
```
/media/voice/{year}/{month}/{uuid}.{ext}
/media/voice/2026/01/770e8400-e29b-41d4.m4a
```

### Document URL
```
/media/documents/{year}/{month}/{uuid}.{ext}
/media/documents/2026/01/990e8400-e29b-41d4.pdf
```

## 📊 Upload Response Examples

### Image Upload Response
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

### Video Upload Response
```json
{
  "success": true,
  "data": {
    "url": "/media/videos/2026/01/660e8400-e29b-41d4.mp4",
    "thumbnailUrl": null,
    "type": "video/mp4",
    "size": 5242880,
    "duration": 0
  }
}
```

### Voice Upload Response
```json
{
  "success": true,
  "data": {
    "url": "/media/voice/2026/01/770e8400-e29b-41d4.m4a",
    "type": "audio/mp4",
    "size": 512000
  }
}
```

### Document Upload Response
```json
{
  "success": true,
  "data": {
    "url": "/media/documents/2026/01/990e8400-e29b-41d4.pdf",
    "type": "application/pdf",
    "size": 2097152
  }
}
```

## 🗄️ Database Storage

When a message with media is sent, these fields are populated:

```sql
INSERT INTO ripplevids_messages (
  id,
  conversation_id,
  sender_id,
  body,
  type,
  media_url,
  media_thumbnail_url,
  media_type,
  media_size_bytes,
  media_duration_seconds,
  media_width,
  media_height,
  metadata
) VALUES (
  'msg-uuid-001',
  'conv-uuid-123',
  'user-uuid-456',
  'Check this out!',
  'image',
  '/media/images/2026/01/550e8400-e29b-41d4.jpg',
  '/media/images/2026/01/550e8400-e29b-41d4_thumb.jpg',
  'image/jpeg',
  102400,
  NULL,
  1920,
  1080,
  '{"width":1920,"height":1080,"duration":null,"size":102400}'
);
```

## 🔐 File Access & Security

### Public Access
Files are served via Express static route `/media`:
```
GET /media/images/2026/01/550e8400-e29b-41d4.jpg
GET /media/videos/2026/01/660e8400-e29b-41d4.mp4
GET /media/voice/2026/01/770e8400-e29b-41d4.m4a
GET /media/documents/2026/01/990e8400-e29b-41d4.pdf
```

### Cache Headers
Files are served with cache headers (can be customized):
```
Cache-Control: public, max-age=31536000  (1 year)
```

### Security Measures
1. **UUID Filenames** - Prevents direct enumeration
2. **MIME Validation** - Only allowed types
3. **Size Limits** - Prevents abuse
4. **Extension Validation** - Prevents execution
5. **Database Tracking** - Know who uploaded what

## 🔄 Message with Media Flow

### Client Sends Message with Image

```javascript
// Step 1: Upload file
POST /api/chat/upload
Body:
  - file: [image buffer]
  - type: "image"
  - conversationId: "conv-uuid"

Response: {
  url: "/media/images/2026/01/550e8400-e29b-41d4.jpg",
  thumbnailUrl: "/media/images/2026/01/550e8400-e29b-41d4_thumb.jpg",
  width: 1920,
  height: 1080,
  size: 102400
}

// Step 2: Send message with media
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

// Step 3: Message stored in database with URL
INSERT INTO ripplevids_messages (
  ...,
  media_url: '/media/images/2026/01/550e8400-e29b-41d4.jpg',
  media_type: 'image/jpeg',
  media_width: 1920,
  media_height: 1080,
  ...
)

// Step 4: Broadcast to room
socket.on('new_message', {
  ...,
  media_url: '/media/images/2026/01/550e8400-e29b-41d4.jpg',
  ...
})

// Step 5: Other client fetches file
GET /media/images/2026/01/550e8400-e29b-41d4.jpg
Response: [JPEG image data]
```

## 📈 Disk Space Management

### Estimated Storage
- **Small app** (1000 users, 1 month): ~10-50 GB
- **Medium app** (10000 users, 3 months): ~100-500 GB
- **Large app** (100000 users, 1 year): ~1-10 TB

### Archival Strategy
```bash
# Move files older than 90 days to cold storage
/media/images/2025/01/    → Archive to S3 Glacier
/media/images/2025/02/    → Archive to S3 Glacier
/media/images/2026/01/    → Keep on disk
```

### Cleanup Script (Optional)
```bash
# Remove files older than 2 years
find ./media -mtime +730 -delete

# Verify structure
du -sh ./media/images/
du -sh ./media/videos/
du -sh ./media/voice/
du -sh ./media/documents/
```

## 🚀 CDN Integration (Production)

For production, integrate with CloudFront/Cloudflare:

### Before (Local):
```
User → /media/images/2026/01/uuid.jpg → Server Disk
```

### After (CDN):
```
User → CloudFront CDN → S3 Bucket → Server Backup
       (Cached)         (Origin)     (Fallback)
```

### URL Migration:
```javascript
// Before
const url = "/media/images/2026/01/550e8400.jpg";

// After
const url = "https://cdn.ripplevids.com/images/2026/01/550e8400.jpg";
```

## ⚙️ Configuration

Edit `server.js` to customize:

```javascript
// Line 24-32: Storage directories
const STORAGE_DIRS = {
    images: path.join(MEDIA_BASE_DIR, 'images'),
    videos: path.join(MEDIA_BASE_DIR, 'videos'),
    voice: path.join(MEDIA_BASE_DIR, 'voice'),
    documents: path.join(MEDIA_BASE_DIR, 'documents')
};

// Line 57-65: File size limits
const allowedSizes = {
    image: 10 * 1024 * 1024,      // 10 MB
    video: 50 * 1024 * 1024,      // 50 MB
    voice: 5 * 1024 * 1024,       // 5 MB
    document: 20 * 1024 * 1024    // 20 MB
};

// Line 43-51: Allowed MIME types
const allowedTypes = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/quicktime'],
    voice: ['audio/mp4', 'audio/mpeg', 'audio/ogg'],
    document: ['application/pdf', '...']
};
```

## 📋 Troubleshooting

### Issue: Files not saving
**Solution:**
```bash
# Check directory permissions
ls -la ./media/
chmod 755 ./media/

# Check disk space
df -h

# Check user permissions
whoami
```

### Issue: URLs returning 404
**Solution:**
```bash
# Verify files exist
ls -la ./media/images/2026/01/

# Check Express static route
grep "app.use" server.js
# Should show: app.use('/media', express.static(MEDIA_BASE_DIR))

# Test direct access
curl http://localhost:3904/media/images/2026/01/{uuid}.jpg
```

### Issue: Upload size limits
**Solution:**
```bash
# Check file size
ls -lh test_file.jpg

# Check multer limits in server.js (line 61-63)
limits: { fileSize: 50 * 1024 * 1024 }

# Increase if needed for your use case
```

## 🎯 Summary

- ✅ Organized by type and date
- ✅ Automatic directory creation
- ✅ UUID-based filenames
- ✅ Thumbnail generation for images
- ✅ Local URLs stored in database
- ✅ Express static serving
- ✅ Ready for CDN migration
- ✅ Security built-in
