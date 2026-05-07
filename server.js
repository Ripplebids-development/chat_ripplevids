const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3904;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Create media storage directories
const MEDIA_BASE_DIR = path.join(__dirname, 'media');
const STORAGE_DIRS = {
    images: path.join(MEDIA_BASE_DIR, 'images'),
    videos: path.join(MEDIA_BASE_DIR, 'videos'),
    voice: path.join(MEDIA_BASE_DIR, 'voice'),
    documents: path.join(MEDIA_BASE_DIR, 'documents')
};

// Ensure directories exist
Object.values(STORAGE_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Serve media files
app.use('/media', express.static(MEDIA_BASE_DIR));

// Configure multer for file uploads
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        video: ['video/mp4', 'video/quicktime'],
        voice: ['audio/mp4', 'audio/mpeg', 'audio/ogg'],
        document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    };

    const type = req.body.type || 'image';
    if (allowedTypes[type] && allowedTypes[type].includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type for ${type}`), false);
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter
});

// Helper Functions
function getSortedParticipants(user1, user2) {
    return [user1, user2].sort();
}

async function findOrCreateConversation(userId1, userId2) {
    try {
        // Check if conversation exists
        const [existing] = await db.execute(`
            SELECT c.* FROM conversations c
            JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
            JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
            WHERE cp1.user_id = ? AND cp2.user_id = ? AND c.is_group = FALSE
            LIMIT 1
        `, [userId1, userId2]);

        if (existing.length > 0) {
            return existing[0];
        }

        // Create new conversation
        const convId = uuidv4();
        await db.execute(
            'INSERT INTO conversations (id, is_group) VALUES (?, FALSE)',
            [convId]
        );

        // Add participants
        const p1Id = uuidv4();
        const p2Id = uuidv4();
        await db.execute(
            'INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES (?, ?, ?), (?, ?, ?)',
            [p1Id, convId, userId1, p2Id, convId, userId2]
        );

        const [newConv] = await db.execute('SELECT * FROM conversations WHERE id = ?', [convId]);
        return newConv[0];
    } catch (error) {
        console.error('Error in findOrCreateConversation:', error);
        throw error;
    }
}

async function saveMessage(conversationId, senderId, body, type = 'text', mediaUrl = null, mediaData = null, replyToMessageId = null) {
    try {
        const messageId = uuidv4();
        const createdAt = new Date();

        let metadata = {};
        if (mediaData) {
            metadata = {
                width: mediaData.width,
                height: mediaData.height,
                duration: mediaData.duration,
                size: mediaData.size
            };
        }

        await db.execute(
            `INSERT INTO ripplevids_messages 
            (id, conversation_id, sender_id, body, type, created_at, media_url, media_type, media_size_bytes, 
             media_duration_seconds, media_width, media_height, metadata, reply_to_message_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [messageId, conversationId, senderId, body, type, createdAt, mediaUrl, 
             mediaData?.mimeType, mediaData?.size, mediaData?.duration, mediaData?.width, 
             mediaData?.height, JSON.stringify(metadata), replyToMessageId]
        );

        // Update conversation last message
        await db.execute(
            'UPDATE conversations SET last_message_at = ?, last_message_content = ?, last_message_sender_id = ? WHERE id = ?',
            [createdAt, body || '[Media]', senderId, conversationId]
        );

        const [messages] = await db.execute('SELECT * FROM ripplevids_messages WHERE id = ?', [messageId]);
        return messages[0];
    } catch (error) {
        console.error('Error saving message:', error);
        throw error;
    }
}

async function getMessages(conversationId, limit = 50, offset = 0) {
    try {
        const [messages] = await db.execute(`
            SELECT m.*, 
                   (SELECT COUNT(*) FROM message_reads WHERE message_id = m.id) as read_count
            FROM ripplevids_messages m
            WHERE m.conversation_id = ? AND m.is_deleted = FALSE
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `, [conversationId, parseInt(limit), parseInt(offset)]);

        return messages.reverse();
    } catch (error) {
        console.error('Error getting messages:', error);
        throw error;
    }
}

async function canSendMessage(userId, conversationId) {
    try {
        // Check if user is participant
        const [participant] = await db.execute(
            'SELECT * FROM conversation_participants WHERE user_id = ? AND conversation_id = ?',
            [userId, conversationId]
        );

        if (participant.length === 0) {
            throw new Error('Not authorized');
        }

        // Check if blocked
        const [blocked] = await db.execute(
            'SELECT * FROM blocked_users WHERE (blocker_id = ? OR blocked_id = ?)',
            [userId, userId]
        );

        if (blocked.length > 0) {
            throw new Error('User is blocked');
        }

        return true;
    } catch (error) {
        console.error('Error in canSendMessage:', error);
        throw error;
    }
}

// REST API Routes

/**
 * Upload Media Endpoint - Stores files locally and saves URL to database
 */
app.post('/api/chat/upload', upload.single('file'), async (req, res) => {
    try {
        const { type = 'image', conversationId } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file provided' });
        }

        if (!conversationId) {
            return res.status(400).json({ success: false, error: 'Conversation ID required' });
        }

        // Validate file type
        const allowedSizes = {
            image: 10 * 1024 * 1024,
            video: 50 * 1024 * 1024,
            voice: 5 * 1024 * 1024,
            document: 20 * 1024 * 1024
        };

        if (file.size > allowedSizes[type]) {
            return res.status(400).json({ success: false, error: `File too large for ${type}` });
        }

        // Get current date for directory structure
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const dateDir = path.join(STORAGE_DIRS[type], year.toString(), month);

        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }

        const filename = `${uuidv4()}${path.extname(file.originalname)}`;
        const filepath = path.join(dateDir, filename);
        const fileUrl = `/media/${type}/${year}/${month}/${filename}`;

        let mediaData = {
            mimeType: file.mimetype,
            size: file.size
        };

        // Process based on type
        if (type === 'image') {
            // Save and generate thumbnail
            await sharp(file.buffer).toFile(filepath);

            // Generate thumbnail
            const thumbFilename = `${path.parse(filename).name}_thumb${path.extname(filename)}`;
            const thumbPath = path.join(dateDir, thumbFilename);
            const thumbUrl = `/media/${type}/${year}/${month}/${thumbFilename}`;

            await sharp(file.buffer)
                .resize(300, 300, { fit: 'cover' })
                .toFile(thumbPath);

            const metadata = await sharp(file.buffer).metadata();
            mediaData.width = metadata.width;
            mediaData.height = metadata.height;

            return res.json({
                success: true,
                data: {
                    url: fileUrl,
                    thumbnailUrl: thumbUrl,
                    type: file.mimetype,
                    size: file.size,
                    width: metadata.width,
                    height: metadata.height
                }
            });
        } else if (type === 'video') {
            // For video, just save for now (in production would transcode)
            fs.writeFileSync(filepath, file.buffer);

            mediaData.duration = 0; // Would extract actual duration in production

            return res.json({
                success: true,
                data: {
                    url: fileUrl,
                    thumbnailUrl: null,
                    type: file.mimetype,
                    size: file.size,
                    duration: 0
                }
            });
        } else if (type === 'voice' || type === 'document') {
            // Save file
            fs.writeFileSync(filepath, file.buffer);

            return res.json({
                success: true,
                data: {
                    url: fileUrl,
                    type: file.mimetype,
                    size: file.size
                }
            });
        }

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get Conversations for User
 */
app.get('/api/conversations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const [conversations] = await db.execute(`
            SELECT 
                c.id,
                c.is_group,
                c.group_name,
                c.group_avatar_url,
                c.last_message_content,
                c.last_message_at,
                c.last_message_sender_id,
                (SELECT COUNT(*) FROM ripplevids_messages 
                 WHERE conversation_id = c.id AND id NOT IN 
                 (SELECT message_id FROM message_reads WHERE user_id = ?)
                ) as unread_count,
                GROUP_CONCAT(DISTINCT CASE WHEN cp.user_id != ? THEN cp.user_id END) as other_user_ids
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id
            WHERE cp.user_id = ? AND cp.is_archived = FALSE
            GROUP BY c.id
            ORDER BY c.last_message_at DESC
        `, [userId, userId, userId]);

        res.json(conversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

/**
 * Get Conversation Details
 */
app.get('/api/chat/conversations/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;

        const [conversation] = await db.execute(
            'SELECT * FROM conversations WHERE id = ?',
            [conversationId]
        );

        if (conversation.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const [participants] = await db.execute(
            'SELECT * FROM conversation_participants WHERE conversation_id = ?',
            [conversationId]
        );

        res.json({
            success: true,
            data: {
                ...conversation[0],
                participants
            }
        });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

/**
 * Search Messages
 */
app.get('/api/chat/conversations/:conversationId/search', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Search query required' });
        }

        const [messages] = await db.execute(`
            SELECT * FROM ripplevids_messages
            WHERE conversation_id = ? AND body LIKE ? AND is_deleted = FALSE
            ORDER BY created_at DESC
        `, [conversationId, `%${q}%`]);

        res.json({
            success: true,
            data: {
                messages,
                total: messages.length
            }
        });
    } catch (error) {
        console.error('Error searching messages:', error);
        res.status(500).json({ error: 'Failed to search messages' });
    }
});

/**
 * Block/Unblock User
 */
app.post('/api/chat/block', async (req, res) => {
    try {
        const { userId, targetUserId, action } = req.body;

        if (!userId || !targetUserId) {
            return res.status(400).json({ error: 'User IDs required' });
        }

        if (action === 'block') {
            const blockId = uuidv4();
            await db.execute(
                'INSERT IGNORE INTO blocked_users (id, blocker_id, blocked_id) VALUES (?, ?, ?)',
                [blockId, userId, targetUserId]
            );
            res.json({ success: true, message: 'User blocked successfully' });
        } else if (action === 'unblock') {
            await db.execute(
                'DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?',
                [userId, targetUserId]
            );
            res.json({ success: true, message: 'User unblocked successfully' });
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Block error:', error);
        res.status(500).json({ error: 'Failed to update block status' });
    }
});

/**
 * Archive Conversation
 */
app.post('/api/chat/conversations/:conversationId/archive', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { userId, isArchived } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        await db.execute(
            'UPDATE conversation_participants SET is_archived = ? WHERE conversation_id = ? AND user_id = ?',
            [isArchived ? 1 : 0, conversationId, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Archive error:', error);
        res.status(500).json({ error: 'Failed to archive conversation' });
    }
});

/**
 * Delete Message
 */
app.post('/api/messages/:messageId/delete', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        // Verify user is sender
        const [message] = await db.execute(
            'SELECT * FROM ripplevids_messages WHERE id = ?',
            [messageId]
        );

        if (message.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message[0].sender_id !== userId) {
            return res.status(403).json({ error: 'Not authorized to delete this message' });
        }

        await db.execute(
            'UPDATE ripplevids_messages SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?',
            [messageId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

/**
 * Add Reaction to Message
 */
app.post('/api/messages/:messageId/reactions', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId, emoji } = req.body;

        if (!userId || !emoji) {
            return res.status(400).json({ error: 'User ID and emoji required' });
        }

        const reactionId = uuidv4();
        await db.execute(
            'INSERT IGNORE INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)',
            [reactionId, messageId, userId, emoji]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Reaction error:', error);
        res.status(500).json({ error: 'Failed to add reaction' });
    }
});

/**
 * Remove Reaction from Message
 */
app.delete('/api/messages/:messageId/reactions/:emoji', async (req, res) => {
    try {
        const { messageId, emoji } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        await db.execute(
            'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
            [messageId, userId, emoji]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Remove reaction error:', error);
        res.status(500).json({ error: 'Failed to remove reaction' });
    }
});

// Socket.IO Events

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    /**
     * Register user for real-time updates
     */
    socket.on('register_user', (userId) => {
        if (userId) {
            socket.userId = userId;
            socket.join(`user:${userId}`);
            console.log(`User registered: ${userId}`);
        }
    });

    /**
     * Join or create a 1-on-1 conversation
     */
    socket.on('join_chat', async ({ userId, targetUserId }) => {
        try {
            if (!userId || !targetUserId) {
                return socket.emit('error', { message: 'Missing user IDs' });
            }

            const conversation = await findOrCreateConversation(userId, targetUserId);
            const roomId = `room:${conversation.id}`;
            socket.join(roomId);
            socket.currentRoom = roomId;
            socket.currentConversationId = conversation.id;

            socket.emit('room_joined', { roomId: conversation.id, room: conversation });

            // Fetch initial messages
            const messages = await getMessages(conversation.id, 50, 0);
            socket.emit('message_history', { roomId: conversation.id, messages });

        } catch (error) {
            console.error('Error joining chat:', error);
            socket.emit('error', { message: 'Failed to join chat' });
        }
    });

    /**
     * Send message
     */
    socket.on('send_message', async ({ roomId, senderId, body, type = 'text', replyToMessageId = null }) => {
        try {
            if (!roomId || !senderId || (type === 'text' && !body)) {
                return socket.emit('error', { message: 'Missing message details' });
            }

            // Verify authorization
            await canSendMessage(senderId, roomId);

            const message = await saveMessage(roomId, senderId, body, type, null, null, replyToMessageId);

            const messageObj = {
                id: message.id,
                conversation_id: roomId,
                sender_id: senderId,
                body: message.body,
                type: message.type,
                created_at: message.created_at,
                reply_to_message_id: replyToMessageId
            };

            io.to(`room:${roomId}`).emit('new_message', messageObj);

            // Notify other user in conversation
            const [participants] = await db.execute(
                'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?',
                [roomId, senderId]
            );

            participants.forEach(p => {
                io.to(`user:${p.user_id}`).emit('chat_list_update', {
                    conversation_id: roomId,
                    last_message: body,
                    sender_id: senderId,
                    updated_at: new Date()
                });
            });

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    /**
     * Send message with media
     */
    socket.on('send_media_message', async ({ roomId, senderId, body, type, mediaUrl, mediaData, replyToMessageId = null }) => {
        try {
            if (!roomId || !senderId || !mediaUrl) {
                return socket.emit('error', { message: 'Missing media details' });
            }

            await canSendMessage(senderId, roomId);

            const message = await saveMessage(roomId, senderId, body || '[Media]', type, mediaUrl, mediaData, replyToMessageId);

            const messageObj = {
                id: message.id,
                conversation_id: roomId,
                sender_id: senderId,
                body: message.body,
                type: message.type,
                media_url: message.media_url,
                media_type: message.media_type,
                created_at: message.created_at
            };

            io.to(`room:${roomId}`).emit('new_message', messageObj);

            const [participants] = await db.execute(
                'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?',
                [roomId, senderId]
            );

            participants.forEach(p => {
                io.to(`user:${p.user_id}`).emit('chat_list_update', {
                    conversation_id: roomId,
                    last_message: body || '[Media]',
                    sender_id: senderId,
                    updated_at: new Date()
                });
            });

        } catch (error) {
            console.error('Error sending media message:', error);
            socket.emit('error', { message: 'Failed to send media message' });
        }
    });

    /**
     * Fetch older messages (pagination)
     */
    socket.on('fetch_messages', async ({ roomId, limit = 20, offset = 0 }) => {
        try {
            const messages = await getMessages(roomId, limit, offset);
            socket.emit('more_messages', {
                roomId,
                messages,
                offset: offset + messages.length,
                hasMore: messages.length === limit
            });
        } catch (error) {
            console.error('Error fetching messages:', error);
            socket.emit('error', { message: 'Failed to fetch messages' });
        }
    });

    /**
     * Get all conversations for user
     */
    socket.on('get_conversations', async ({ userId }) => {
        try {
            const [conversations] = await db.execute(`
                SELECT 
                    c.*,
                    (SELECT COUNT(*) FROM ripplevids_messages 
                     WHERE conversation_id = c.id AND id NOT IN 
                     (SELECT message_id FROM message_reads WHERE user_id = ?)
                    ) as unread_count,
                    GROUP_CONCAT(DISTINCT CASE WHEN cp.user_id != ? THEN cp.user_id END) as other_user_ids
                FROM conversations c
                JOIN conversation_participants cp ON c.id = cp.conversation_id
                WHERE cp.user_id = ? AND cp.is_archived = FALSE
                GROUP BY c.id
                ORDER BY c.last_message_at DESC
            `, [userId, userId, userId]);

            socket.emit('conversations', { conversations });
        } catch (error) {
            console.error('Error getting conversations:', error);
            socket.emit('error', { message: 'Failed to fetch conversations' });
        }
    });

    /**
     * Mark message as read
     */
    socket.on('mark_as_read', async ({ messageId, userId }) => {
        try {
            const readId = uuidv4();
            await db.execute(
                'INSERT IGNORE INTO message_reads (id, message_id, user_id) VALUES (?, ?, ?)',
                [readId, messageId, userId]
            );

            const [message] = await db.execute(
                'SELECT conversation_id FROM ripplevids_messages WHERE id = ?',
                [messageId]
            );

            if (message.length > 0) {
                io.to(`room:${message[0].conversation_id}`).emit('message_read', {
                    messageId,
                    userId,
                    readAt: new Date()
                });
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    });

    /**
     * Typing indicators
     */
    socket.on('typing_start', async ({ roomId, userId }) => {
        try {
            io.to(`room:${roomId}`).emit('user_typing', {
                userId,
                roomId,
                isTyping: true
            });
        } catch (error) {
            console.error('Error in typing_start:', error);
        }
    });

    socket.on('typing_stop', async ({ roomId, userId }) => {
        try {
            io.to(`room:${roomId}`).emit('user_typing', {
                userId,
                roomId,
                isTyping: false
            });
        } catch (error) {
            console.error('Error in typing_stop:', error);
        }
    });

    /**
     * Delete message
     */
    socket.on('delete_message', async ({ messageId, conversationId, userId }) => {
        try {
            const [message] = await db.execute(
                'SELECT * FROM ripplevids_messages WHERE id = ?',
                [messageId]
            );

            if (message.length === 0) {
                return socket.emit('error', { message: 'Message not found' });
            }

            if (message[0].sender_id !== userId) {
                return socket.emit('error', { message: 'Not authorized' });
            }

            await db.execute(
                'UPDATE ripplevids_messages SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?',
                [messageId]
            );

            io.to(`room:${conversationId}`).emit('message_deleted', {
                messageId,
                conversationId
            });
        } catch (error) {
            console.error('Error deleting message:', error);
            socket.emit('error', { message: 'Failed to delete message' });
        }
    });

    /**
     * Add reaction to message
     */
    socket.on('add_reaction', async ({ messageId, conversationId, userId, emoji }) => {
        try {
            const reactionId = uuidv4();
            await db.execute(
                'INSERT IGNORE INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)',
                [reactionId, messageId, userId, emoji]
            );

            io.to(`room:${conversationId}`).emit('message_reaction_added', {
                messageId,
                userId,
                emoji
            });
        } catch (error) {
            console.error('Error adding reaction:', error);
            socket.emit('error', { message: 'Failed to add reaction' });
        }
    });

    /**
     * Remove reaction from message
     */
    socket.on('remove_reaction', async ({ messageId, conversationId, userId, emoji }) => {
        try {
            await db.execute(
                'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
                [messageId, userId, emoji]
            );

            io.to(`room:${conversationId}`).emit('message_reaction_removed', {
                messageId,
                userId,
                emoji
            });
        } catch (error) {
            console.error('Error removing reaction:', error);
            socket.emit('error', { message: 'Failed to remove reaction' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
});
