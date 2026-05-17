<USER_REQUEST>
Based on the below spec, 
I want you to work on another server.js but not for direct messaging.
For the websocket messaging system for live streams.
CHeck how lives are handled in upload_service directory
The app.py

C:\Users\HP\Desktop\upload_service


📡 Backend Specification: Secure & Scalable WebSocket Livestream Chat
This document defines the backend design, message schemas, room lifecycle states, authentication protocol, database persistence, and scale-out architecture for the secure WebSocket Livestream Chat service (CHAT_BASE).

🚀 1. Architecture Overview
The Livestream Chat backend operates as a bidirectional, event-driven service utilizing secured WebSockets (wss://). It must support concurrent rooms keyed by live_session_id and scale horizontally using a Pub/Sub layer.

WS Connection
WS Connection
Redis Channel: live_session_id
Redis Channel: live_session_id
Async Batch Write
Mobile Client A
WebSocket Server Node 1
Mobile Client B
WebSocket Server Node 2
Redis Pub/Sub
<truncated 5723 bytes>