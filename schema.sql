-- Conversations table (replaces rooms with enhanced features)
CREATE TABLE IF NOT EXISTS conversations (
    id CHAR(36) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NULL,
    last_message_content TEXT,
    last_message_sender_id CHAR(36),
    is_group BOOLEAN DEFAULT FALSE,
    group_name VARCHAR(255),
    group_avatar_url TEXT,
    INDEX idx_conversations_updated (updated_at DESC),
    INDEX idx_conversations_last_message (last_message_at DESC)
);

-- Conversation participants table
CREATE TABLE IF NOT EXISTS conversation_participants (
    id CHAR(36) PRIMARY KEY,
    conversation_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP NULL,
    is_muted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    role VARCHAR(50) DEFAULT 'member',
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    UNIQUE KEY unique_participant (conversation_id, user_id),
    INDEX idx_participants_user (user_id),
    INDEX idx_participants_conversation (conversation_id),
    INDEX idx_participants_archived (user_id, is_archived)
);

-- Messages table
CREATE TABLE IF NOT EXISTS ripplevids_messages (
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
    FOREIGN KEY (reply_to_message_id) REFERENCES ripplevids_messages(id) ON DELETE SET NULL,
    INDEX idx_messages_conversation (conversation_id, created_at DESC),
    INDEX idx_messages_sender (sender_id),
    INDEX idx_messages_created (created_at DESC),
    INDEX idx_messages_reply (reply_to_message_id)
);

-- Message reads table
CREATE TABLE IF NOT EXISTS message_reads (
    id CHAR(36) PRIMARY KEY,
    message_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES ripplevids_messages(id) ON DELETE CASCADE,
    UNIQUE KEY unique_read (message_id, user_id),
    INDEX idx_reads_message (message_id),
    INDEX idx_reads_user (user_id)
);

-- Message reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
    id CHAR(36) PRIMARY KEY,
    message_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES ripplevids_messages(id) ON DELETE CASCADE,
    UNIQUE KEY unique_reaction (message_id, user_id, emoji),
    INDEX idx_reactions_message (message_id)
);

-- Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id CHAR(36) PRIMARY KEY,
    blocker_id CHAR(36) NOT NULL,
    blocked_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_block (blocker_id, blocked_id),
    INDEX idx_blocked_blocker (blocker_id),
    INDEX idx_blocked_blocked (blocked_id)
);

-- Keep the old rooms table for backward compatibility (can be deprecated later)
CREATE TABLE IF NOT EXISTS rooms (
    id CHAR(36) PRIMARY KEY,
    participant1 CHAR(36) NOT NULL,
    participant2 CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NULL,
    UNIQUE KEY unique_participants (participant1, participant2),
    INDEX idx_last_message_at (last_message_at)
);
