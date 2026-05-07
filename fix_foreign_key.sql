-- Fix foreign key constraint for ripplevids_messages table
-- This script will drop the old constraint referencing 'rooms' and add a new one referencing 'conversations'

USE ripplebids;

-- Step 1: Drop the old foreign key constraint
ALTER TABLE ripplevids_messages 
DROP FOREIGN KEY ripplevids_messages_ibfk_1;

-- Step 2: Add the correct foreign key constraint referencing conversations table
ALTER TABLE ripplevids_messages 
ADD CONSTRAINT ripplevids_messages_ibfk_1 
FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Verify the change
SHOW CREATE TABLE ripplevids_messages;
