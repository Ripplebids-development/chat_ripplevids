-- Cleanup script to delete conversations with invalid/non-existent users
-- This will delete conversations where the other participant doesn't exist in the users table

USE ripplebids;

-- First, let's see what we're about to delete (for safety)
SELECT 
    c.id as conversation_id,
    c.created_at,
    c.last_message_at,
    GROUP_CONCAT(cp.user_id) as participant_ids,
    COUNT(DISTINCT u.id) as valid_users_count
FROM conversations c
JOIN conversation_participants cp ON c.id = cp.conversation_id
LEFT JOIN users u ON cp.user_id = u.id
GROUP BY c.id
HAVING valid_users_count < 2;

-- Now delete the orphaned conversations
-- This will cascade delete all related data (messages, participants, etc.)
DELETE c FROM conversations c
WHERE c.id IN (
    SELECT conv_id FROM (
        SELECT 
            c2.id as conv_id,
            COUNT(DISTINCT u.id) as valid_users_count
        FROM conversations c2
        JOIN conversation_participants cp ON c2.id = cp.conversation_id
        LEFT JOIN users u ON cp.user_id = u.id
        GROUP BY c2.id
        HAVING valid_users_count < 2
    ) AS orphaned_convs
);

-- Verify cleanup
SELECT 
    c.id,
    c.created_at,
    c.last_message_at,
    GROUP_CONCAT(DISTINCT cp.user_id) as participant_ids,
    GROUP_CONCAT(DISTINCT u.username) as usernames
FROM conversations c
JOIN conversation_participants cp ON c.id = cp.conversation_id
LEFT JOIN users u ON cp.user_id = u.id
GROUP BY c.id
ORDER BY c.created_at DESC;
