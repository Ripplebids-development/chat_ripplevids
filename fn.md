import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Image,
  Animated,
  Easing,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { theme } from "../theme";
import { useAuth, useIsLoggedIn } from "../context/AuthContext";
import io from "socket.io-client";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "https://api.ripplebids.com";
const CHAT_BASE = "http://10.127.188.20:3904";

const ATTACHMENT_ACTIONS = [
  { icon: "image-outline",        label: "Photo",    color: "#4CAF50", type: "image" },
  { icon: "camera-outline",       label: "Camera",   color: "#2196F3", type: "image" },
  { icon: "videocam-outline",     label: "Video",    color: "#9C27B0", type: "video" },
  { icon: "mic-outline",          label: "Voice",    color: "#FF5722", type: "voice" },
  { icon: "document-outline",     label: "Doc",      color: "#607D8B", type: "document" },
  { icon: "person-outline",       label: "Contact",  color: "#00BCD4", type: "contact" },
];

// ─── Utilities ─────────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return "Today";
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function shouldShowTimestamp(messages, index) {
  if (index === messages.length - 1) return true;
  const curr = messages[index];
  const next = messages[index + 1];
  if (curr.from !== next.from) return true;
  if (next.ts - curr.ts > 5 * 60 * 1000) return true;
  return false;
}

function isLastInGroup(messages, index) {
  if (index === messages.length - 1) return true;
  return messages[index].from !== messages[index + 1].from;
}

function isFirstInGroup(messages, index) {
  if (index === 0) return true;
  return messages[index].from !== messages[index - 1].from;
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

const TypingIndicator = memo(() => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -5, duration: 300, useNativeDriver: true, easing: Easing.ease }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.ease }),
          Animated.delay(600),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 150);
    const a3 = anim(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={typStyles.row}>
      <View style={typStyles.bubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[typStyles.dot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
});

const typStyles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 10, paddingHorizontal: 4 },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.divider,
  },
  dot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: theme.textSecondary,
    marginHorizontal: 2,
  },
});

// ─── DateSeparator ────────────────────────────────────────────────────────────

const DateSeparator = memo(({ label }) => (
  <View style={dsStyles.row}>
    <View style={dsStyles.line} />
    <Text style={dsStyles.label}>{label}</Text>
    <View style={dsStyles.line} />
  </View>
));

const dsStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: 16, paddingHorizontal: 4 },
  line: { flex: 1, height: 1, backgroundColor: theme.divider },
  label: {
    marginHorizontal: 12,
    fontSize: 11,
    fontFamily: "Montserrat_600SemiBold",
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
});

// ─── MessageActionsModal ──────────────────────────────────────────────────────

const MessageActionsModal = memo(({ visible, message, onClose, onReact, onReply, onDelete, onRetry }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [visible]);

  if (!visible) return null;

  const isMe = message?.from === "me";
  const isFailed = message?.failed;

  return (
    <Pressable style={mamStyles.overlay} onPress={onClose}>
      <Animated.View
        style={[
          mamStyles.modal,
          {
            opacity: slideAnim,
            transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          },
        ]}
      >
        <View style={mamStyles.header}>
          <Text style={mamStyles.title}>Message Actions</Text>
          <Pressable onPress={onClose} style={mamStyles.closeBtn}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={mamStyles.actions}>
          {!isFailed && (
            <>
              <Pressable style={mamStyles.actionBtn} onPress={() => { onReact?.(); onClose(); }}>
                <Ionicons name="happy-outline" size={20} color={theme.textPrimary} />
                <Text style={mamStyles.actionText}>React</Text>
              </Pressable>

              <Pressable style={mamStyles.actionBtn} onPress={() => { onReply?.(); onClose(); }}>
                <Ionicons name="arrow-undo-outline" size={20} color={theme.textPrimary} />
                <Text style={mamStyles.actionText}>Reply</Text>
              </Pressable>
            </>
          )}

          {isMe && !isFailed && (
            <Pressable style={mamStyles.actionBtn} onPress={() => { onDelete?.(); onClose(); }}>
              <Ionicons name="trash-outline" size={20} color="#F44336" />
              <Text style={[mamStyles.actionText, { color: "#F44336" }]}>Delete</Text>
            </Pressable>
          )}

          {isMe && isFailed && (
            <Pressable style={mamStyles.actionBtn} onPress={() => { onRetry?.(); onClose(); }}>
              <Ionicons name="refresh-outline" size={20} color={theme.primary} />
              <Text style={[mamStyles.actionText, { color: theme.primary }]}>Retry</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
});

const mamStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    width: "80%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: theme.divider,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: theme.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    paddingVertical: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  actionText: {
    fontFamily: "Livvic_400Regular",
    fontSize: 15,
    color: theme.textPrimary,
  },
});

// ─── MessageBubble ────────────────────────────────────────────────────────────

const MessageBubble = memo(({ item, isFirst, isLast, showTimestamp, onLongPress, onSwipeReply }) => {
  const isMe = item.from === "me";
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  const borderRadius = {
    borderRadius: 18,
    ...(isMe
      ? {
          borderTopRightRadius: isFirst ? 18 : 6,
          borderBottomRightRadius: isLast ? 4 : 6,
        }
      : {
          borderTopLeftRadius: isFirst ? 18 : 6,
          borderBottomLeftRadius: isLast ? 4 : 6,
        }),
  };

  if (item.deleted) {
    return (
      <View style={[mbStyles.row, isMe ? mbStyles.rowMe : mbStyles.rowOther]}>
        <View style={[mbStyles.deletedBubble]}>
          <Ionicons name="trash-outline" size={12} color={theme.textSecondary} style={{ marginRight: 4 }} />
          <Text style={mbStyles.deletedText}>Message deleted</Text>
        </View>
      </View>
    );
  }

  if (item.type === "image") {
    return (
      <Animated.View style={[mbStyles.row, isMe ? mbStyles.rowMe : mbStyles.rowOther, { opacity }]}>
        <Pressable onLongPress={() => onLongPress && onLongPress(item)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <View style={[mbStyles.mediaBubble, borderRadius, isMe ? mbStyles.mediaBubbleMe : mbStyles.mediaBubbleOther]}>
              {item.mediaUrl ? (
                <Image
                  source={{ uri: `${CHAT_BASE}${item.mediaUrl}` }}
                  style={mbStyles.imagePreview}
                  resizeMode="cover"
                />
              ) : (
                <View style={mbStyles.imagePreview}>
                  <Ionicons name="image-outline" size={32} color={theme.textSecondary} />
                  <Text style={mbStyles.mediaLabel}>Image</Text>
                </View>
              )}
            </View>
            {showTimestamp && (
              <View style={[mbStyles.timestampRow, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                <Text style={mbStyles.timestamp}>
                  {item.sending ? "Sending…" : item.failed ? "Failed" : formatTime(item.ts)}
                </Text>
                {isMe && !item.sending && !item.failed && (
                  <Ionicons name={item.read ? "checkmark-done" : "checkmark"} size={12} color={item.read ? theme.primary : theme.textSecondary} style={{ marginLeft: 2 }} />
                )}
                {isMe && item.failed && (
                  <Ionicons name="alert-circle" size={12} color="#F44336" style={{ marginLeft: 2 }} />
                )}
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  }

  if (item.type === "video") {
    return (
      <Animated.View style={[mbStyles.row, isMe ? mbStyles.rowMe : mbStyles.rowOther, { opacity }]}>
        <Pressable onLongPress={() => onLongPress && onLongPress(item)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <View style={[mbStyles.mediaBubble, borderRadius, isMe ? mbStyles.mediaBubbleMe : mbStyles.mediaBubbleOther]}>
              <View style={mbStyles.imagePreview}>
                <Ionicons name="play-circle" size={48} color={theme.textSecondary} />
                <Text style={mbStyles.mediaLabel}>Video</Text>
              </View>
            </View>
            {showTimestamp && (
              <View style={[mbStyles.timestampRow, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                <Text style={mbStyles.timestamp}>
                  {item.sending ? "Sending…" : item.failed ? "Failed" : formatTime(item.ts)}
                </Text>
                {isMe && !item.sending && !item.failed && (
                  <Ionicons name={item.read ? "checkmark-done" : "checkmark"} size={12} color={item.read ? theme.primary : theme.textSecondary} style={{ marginLeft: 2 }} />
                )}
                {isMe && item.failed && (
                  <Ionicons name="alert-circle" size={12} color="#F44336" style={{ marginLeft: 2 }} />
                )}
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  }

  if (item.type === "document") {
    return (
      <Animated.View style={[mbStyles.row, isMe ? mbStyles.rowMe : mbStyles.rowOther, { opacity }]}>
        <Pressable onLongPress={() => onLongPress && onLongPress(item)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <View style={[mbStyles.bubble, isMe ? mbStyles.bubbleMe : mbStyles.bubbleOther, borderRadius]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="document-outline" size={24} color={isMe ? "#000" : theme.textPrimary} />
                <Text style={isMe ? mbStyles.textMe : mbStyles.textOther} numberOfLines={1}>
                  {item.text}
                </Text>
              </View>
            </View>
            {showTimestamp && (
              <View style={[mbStyles.timestampRow, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                <Text style={mbStyles.timestamp}>
                  {item.sending ? "Sending…" : item.failed ? "Failed" : formatTime(item.ts)}
                </Text>
                {isMe && !item.sending && !item.failed && (
                  <Ionicons name={item.read ? "checkmark-done" : "checkmark"} size={12} color={item.read ? theme.primary : theme.textSecondary} style={{ marginLeft: 2 }} />
                )}
                {isMe && item.failed && (
                  <Ionicons name="alert-circle" size={12} color="#F44336" style={{ marginLeft: 2 }} />
                )}
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[mbStyles.row, isMe ? mbStyles.rowMe : mbStyles.rowOther, { opacity }]}>
      <Pressable onLongPress={() => onLongPress && onLongPress(item)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {item.replyTo && (
            <View style={[mbStyles.replyPreview, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
              <View style={mbStyles.replyBar} />
              <Text style={mbStyles.replyText} numberOfLines={1}>{item.replyTo.text}</Text>
            </View>
          )}
          <View style={[mbStyles.bubble, isMe ? mbStyles.bubbleMe : mbStyles.bubbleOther, borderRadius]}>
            {item.sending && (
              <View style={mbStyles.sendingOverlay} />
            )}
            <Text style={isMe ? mbStyles.textMe : mbStyles.textOther}>{item.text}</Text>
          </View>
          {item.reactions && item.reactions.length > 0 && (
            <View style={[mbStyles.reactionsRow, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
              {item.reactions.map((r, i) => (
                <Text key={i} style={mbStyles.reaction}>{r}</Text>
              ))}
            </View>
          )}
          {showTimestamp && (
            <View style={[mbStyles.timestampRow, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
              <Text style={mbStyles.timestamp}>
                {item.sending ? "Sending…" : item.failed ? "Failed" : formatTime(item.ts)}
              </Text>
              {isMe && !item.sending && !item.failed && (
                <Ionicons name={item.read ? "checkmark-done" : "checkmark"} size={12} color={item.read ? theme.primary : theme.textSecondary} style={{ marginLeft: 2 }} />
              )}
              {isMe && item.failed && (
                <Ionicons name="alert-circle" size={12} color="#F44336" style={{ marginLeft: 2 }} />
              )}
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

const mbStyles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 2, paddingHorizontal: 4 },
  rowMe: { justifyContent: "flex-end", paddingRight: 2 },
  rowOther: { justifyContent: "flex-start", paddingLeft: 2 },
  bubble: { 
    maxWidth: "82%", 
    paddingHorizontal: 12, 
    paddingVertical: 9, 
    position: "relative",
  },
  bubbleMe: { backgroundColor: theme.primary },
  bubbleOther: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.divider },
  textMe: { 
    fontFamily: "Livvic_400Regular", 
    color: "#000", 
    fontSize: 14.5, 
    lineHeight: 21,
    flexWrap: "wrap",
  },
  textOther: { 
    fontFamily: "Livvic_400Regular", 
    color: theme.textPrimary, 
    fontSize: 14.5, 
    lineHeight: 21,
    flexWrap: "wrap",
  },
  sendingOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.3)" },
  timestampRow: { flexDirection: "row", alignItems: "center", marginTop: 3, marginBottom: 6, paddingHorizontal: 2 },
  timestamp: { fontSize: 10, fontFamily: "Montserrat_600SemiBold", color: theme.textSecondary },
  reactionsRow: { flexDirection: "row", marginTop: 2, paddingHorizontal: 4, gap: 2 },
  reaction: { fontSize: 14 },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    backgroundColor: theme.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: "78%",
    borderWidth: 1,
    borderColor: theme.divider,
  },
  replyBar: { width: 3, height: "100%", minHeight: 20, borderRadius: 2, backgroundColor: theme.primary, marginRight: 6 },
  replyText: { fontSize: 12, color: theme.textSecondary, fontFamily: "Livvic_400Regular", flex: 1 },
  deletedBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.divider,
    borderStyle: "dashed",
  },
  deletedText: { fontSize: 13, color: theme.textSecondary, fontFamily: "Livvic_400Regular", fontStyle: "italic" },
  mediaBubble: { maxWidth: 220, overflow: "hidden" },
  mediaBubbleMe: { backgroundColor: theme.primary },
  mediaBubbleOther: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.divider },
  imagePreview: { width: 200, height: 140, alignItems: "center", justifyContent: "center" },
  mediaLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 4, fontFamily: "Livvic_400Regular" },
});

// ─── AttachmentTray ───────────────────────────────────────────────────────────

const AttachmentTray = memo(({ visible, onClose, onSelectMedia }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        atStyles.tray,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <View style={atStyles.grid}>
        {ATTACHMENT_ACTIONS.map((action, index) => (
          <Pressable
            key={index}
            style={atStyles.item}
            onPress={() => {
              if (action.type === "contact") {
                Alert.alert(action.label, `${action.label} picker coming soon.`);
                onClose();
              } else {
                onSelectMedia(action.type, action.label);
              }
            }}
          >
            <View style={[atStyles.iconCircle, { backgroundColor: action.color + "22" }]}>
              <Ionicons name={action.icon} size={20} color={action.color} />
            </View>
            <Text style={atStyles.label}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
});

const atStyles = StyleSheet.create({
  tray: {
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderColor: theme.divider,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  item: {
    width: "22%",
    alignItems: "center",
    gap: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    fontFamily: "Montserrat_600SemiBold",
    color: theme.textSecondary,
    textAlign: "center",
  },
});

// ─── MessageInput ─────────────────────────────────────────────────────────────

const MessageInput = memo(({ draft, setDraft, onSend, sending, trayOpen, setTrayOpen, insetBottom, onTyping }) => {
  const sendScale = useRef(new Animated.Value(1)).current;
  const hasText = draft.trim().length > 0;

  const handleSendPress = () => {
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.85, useNativeDriver: true, speed: 40 }),
      Animated.spring(sendScale, { toValue: 1, useNativeDriver: true, speed: 40 }),
    ]).start();
    onSend();
  };

  const handleTextChange = (text) => {
    setDraft(text);
    if (onTyping) onTyping(text);
  };

  return (
    <View style={[miStyles.wrap, { paddingBottom: Math.max(0, insetBottom) }]}>
      <View style={miStyles.row}>
        {/* Attachment toggle */}
        <Pressable
          style={[miStyles.iconBtn, trayOpen && { backgroundColor: theme.primary + "22" }]}
          onPress={() => setTrayOpen((v) => !v)}
        >
          <Ionicons
            name={trayOpen ? "close-outline" : "add-outline"}
            size={22}
            color={trayOpen ? theme.primary : theme.textSecondary}
          />
        </Pressable>

        {/* Input container */}
        <View style={miStyles.inputContainer}>
          <TextInput
            style={miStyles.input}
            placeholder="Message…"
            placeholderTextColor={theme.textSecondary}
            value={draft}
            onChangeText={handleTextChange}
            multiline
            returnKeyType="default"
            blurOnSubmit={false}
          />
          {/* Emoji button */}
          <Pressable style={miStyles.emojiBtn}>
            <Ionicons name="happy-outline" size={19} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* Send / Voice */}
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <Pressable
            style={[miStyles.sendBtn, !hasText && miStyles.voiceBtn]}
            onPress={hasText ? handleSendPress : () => Alert.alert("Voice", "Voice recording coming soon.")}
            disabled={hasText && sending}
          >
            <Ionicons
              name={hasText ? "send" : "mic-outline"}
              size={18}
              color="#000"
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
});

const miStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.divider,
  },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.divider,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.divider,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    minHeight: 42,
  },
  input: {
    flex: 1,
    fontFamily: "Livvic_400Regular",
    color: theme.textPrimary,
    fontSize: 14,
    minHeight: 20,
    maxHeight: 96,
    paddingTop: 0,
    paddingBottom: 0,
  },
  emojiBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    alignSelf: "flex-end",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceBtn: {
    backgroundColor: theme.primary,
  },
});

// ─── ChatHeader ───────────────────────────────────────────────────────────────

const ChatHeader = memo(({ username, profilePicUrl, userId, isOnline, isTyping, canGoBack, onBack, onNavigateProfile }) => (
  <View style={chStyles.header}>
    {/* Back */}
    {canGoBack ? (
      <Pressable style={chStyles.iconBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
      </Pressable>
    ) : <View style={chStyles.iconBtn} />}

    {/* Center info */}
    <Pressable style={chStyles.center} onPress={onNavigateProfile}>
      <View style={chStyles.avatarWrap}>
        {profilePicUrl ? (
          <Image
            source={{ uri: String(profilePicUrl).replace(/`/g, "").trim() }}
            style={chStyles.avatar}
          />
        ) : (
          <View style={[chStyles.avatar, chStyles.avatarFallback]}>
            <Ionicons name="person" size={16} color={theme.textSecondary} />
          </View>
        )}
        {isOnline && <View style={chStyles.onlineDot} />}
      </View>
      <View style={chStyles.textCol}>
        <Text style={chStyles.username} numberOfLines={1}>{username || "Message"}</Text>
        <Text style={chStyles.status}>
          {isTyping ? "typing…" : isOnline ? "Active now" : ""}
        </Text>
      </View>
    </Pressable>

    {/* Right actions */}
    <View style={chStyles.actions}>
      <Pressable style={chStyles.iconBtn} onPress={() => Alert.alert("Voice Call", "Coming soon.")} disabled>
        <Ionicons name="call-outline" size={20} color={theme.textSecondary} />
      </Pressable>
      <Pressable style={chStyles.iconBtn} onPress={() => Alert.alert("Video Call", "Coming soon.")} disabled>
        <Ionicons name="videocam-outline" size={20} color={theme.textSecondary} />
      </Pressable>
    </View>
  </View>
));

const chStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    gap: 4,
  },
  center: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surface },
  avatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.divider },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
    borderColor: theme.background,
  },
  textCol: { alignItems: "flex-start" },
  username: {
    fontFamily: "Montserrat_700Bold",
    color: theme.textPrimary,
    fontSize: 16,
    maxWidth: 140,
  },
  status: {
    fontFamily: "Livvic_400Regular",
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  actions: { flexDirection: "row", alignItems: "center" },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
});

// ─── Helpers for building enriched flat list data ──────────────────────────────

function buildListData(messages, showTyping) {
  const items = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !isSameDay(prev.ts, msg.ts)) {
      items.push({ type: "date", label: formatDateLabel(msg.ts), id: `date-${msg.ts}` });
    }
    items.push({
      type: "message",
      ...msg,
      isFirst: isFirstInGroup(messages, i),
      isLast: isLastInGroup(messages, i),
      showTimestamp: shouldShowTimestamp(messages, i),
    });
  });
  if (showTyping) items.push({ type: "typing", id: "typing-indicator" });
  return items;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessageThread() {
  const navigation = useNavigation();
  const route = useRoute();
  const { userId, username, profilePicUrl } = route.params || {};
  const { token, user: me } = useAuth();
  const { isLoggedIn } = useIsLoggedIn();
  const myId = me?.id || me?.user_id || me?.sub;
  const canGoBack = navigation.canGoBack();

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [offset, setOffset] = useState(0);
  const [moreLoading, setMoreLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isOnline] = useState(true);  // placeholder
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const listRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const insets = useSafeAreaInsets();

  // ── Socket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn || !myId || !userId) return;
    try { globalThis.__rv_chat_active = String(userId); } catch { }

    const socket = io(CHAT_BASE, { 
      transports: ["websocket"], 
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: token ? { token } : {}
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      try { if (myId) socket.emit("register_user", String(myId)); } catch { }
      socket.emit("join_chat", { userId: String(myId), targetUserId: String(userId) });
    });

    socket.on("room_joined", (data) => {
      const rid = data?.roomId || data?.room?.id || null;
      setRoomId(rid);
    });

    socket.on("message_history", (data) => {
      const list = Array.isArray(data?.messages) ? data.messages : [];
      const normalized = normalizeMessages(list, myId).sort((a, b) => a.ts - b.ts);
      if (!cancelled) {
        setMessages(normalized);
        setOffset(normalized.length);
      }
    });

    socket.on("new_message", (m) => {
      const sid = m?.sender_id || m?.sender || m?.user_id || m?.from;
      const content = m?.body || m?.content || m?.text || "";
      const t = m?.created_at || m?.timestamp || m?.time || Date.now();
      const tsVal = typeof t === "number" ? t : Date.parse(t) || Date.now();
      const msgId = m?.id || `m-${Date.now()}-${Math.random()}`;
      const msgType = m?.type || "text";
      const mediaUrl = m?.media_url || m?.mediaUrl || null;
      
      const next = {
        id: msgId,
        from: String(sid) === String(myId) ? "me" : "other",
        text: content,
        ts: tsVal,
        read: false,
        type: msgType,
        mediaUrl: mediaUrl,
      };
      
      setMessages((prev) => {
        // Check if message already exists by ID
        if (prev.some((mm) => mm.id === msgId)) return prev;
        
        // If this is my message, replace any optimistic message with matching text or media
        if (String(sid) === String(myId)) {
          const optimisticIndex = prev.findIndex((mm) => 
            mm.sending && 
            mm.from === "me" && 
            (mm.text === content || (mm.mediaUrl && mediaUrl))
          );
          if (optimisticIndex !== -1) {
            // Replace optimistic with confirmed message
            const updated = [...prev];
            updated[optimisticIndex] = next;
            return updated;
          }
        }
        
        // Otherwise add as new message
        return [...prev, next];
      });
      
      if (String(sid) !== String(myId)) setOffset((prev) => prev + 1);
      try {
        if (globalThis.__rv_chat_update) {
          globalThis.__rv_chat_update({ otherId: String(userId), content, time: tsVal, senderId: String(sid) });
        }
      } catch { }
    });

    socket.on("more_messages", (data) => {
      const list = Array.isArray(data?.messages) ? data.messages : [];
      const normalized = normalizeMessages(list, myId).sort((a, b) => a.ts - b.ts);
      setMessages((prev) => [...normalized, ...prev]);
      const nextOffset = typeof data?.offset === "number" ? data.offset : offset + normalized.length;
      setOffset(nextOffset);
      setMoreLoading(false);
    });

    socket.on("user_typing", (data) => {
      const typingUserId = data?.userId;
      const isTypingNow = data?.isTyping;
      if (String(typingUserId) === String(userId)) {
        setIsTyping(isTypingNow);
      }
    });

    socket.on("message_deleted", (data) => {
      const deletedMsgId = data?.messageId;
      if (deletedMsgId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === deletedMsgId ? { ...m, deleted: true } : m))
        );
      }
    });

    socket.on("message_read", (data) => {
      const readMsgId = data?.messageId;
      const readByUserId = data?.userId;
      // Mark message as read if it was read by the other user
      if (readMsgId && String(readByUserId) === String(userId)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === readMsgId ? { ...m, read: true } : m))
        );
      }
    });

    socket.on("error", () => { });

    return () => {
      cancelled = true;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      try {
        if (globalThis.__rv_chat_active) delete globalThis.__rv_chat_active;
        socket.removeAllListeners();
        socket.disconnect();
      } catch { }
      socketRef.current = null;
    };
  }, [isLoggedIn, myId, userId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [messages.length]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (!roomId || !socketRef.current || !myId || messages.length === 0) return;
    
    // Find the last message from the other user
    const lastOtherMessage = [...messages].reverse().find((m) => m.from === "other" && !m.read);
    
    if (lastOtherMessage) {
      try {
        socketRef.current.emit("mark_as_read", {
          messageId: lastOtherMessage.id,
          userId: String(myId)
        });
      } catch { }
    }
  }, [messages, roomId, myId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const fetchOlder = useCallback(() => {
    if (!roomId || !socketRef.current || moreLoading) return;
    setMoreLoading(true);
    socketRef.current.emit("fetch_messages", { roomId, limit: 20, offset: messages.length });
  }, [roomId, moreLoading, messages.length]);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || !roomId || !socketRef.current || sending) return;
    
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    try {
      socketRef.current.emit("typing_stop", { roomId, userId: String(myId) });
    } catch { }
    
    setSending(true);
    setDraft("");
    setTrayOpen(false);

    // Optimistic message with unique ID
    const optimisticId = `opt-${Date.now()}-${Math.random()}`;
    const optimistic = { id: optimisticId, from: "me", text, ts: Date.now(), sending: true, failed: false };
    setMessages((prev) => [...prev, optimistic]);

    // Set timeout to mark as failed after 10 seconds
    const failTimeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId && m.sending ? { ...m, sending: false, failed: true } : m))
      );
      setSending(false);
    }, 10000);

    try {
      socketRef.current.emit("send_message", { roomId, senderId: String(myId), body: text });
      
      // Clear timeout and mark as sent when confirmed
      // The new_message handler will replace the optimistic message
      setTimeout(() => {
        clearTimeout(failTimeout);
        setSending(false);
      }, 1000);
    } catch {
      clearTimeout(failTimeout);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, sending: false, failed: true } : m))
      );
      setSending(false);
      return;
    }

    try {
      if (globalThis.__rv_chat_update) {
        globalThis.__rv_chat_update({ otherId: String(userId), content: text, time: Date.now(), senderId: String(myId) });
      }
    } catch { }
  }, [draft, roomId, sending, myId, userId]);

  const handleLongPress = useCallback((item) => {
    setSelectedMessage(item);
    setModalVisible(true);
  }, []);

  const handleRetry = useCallback(() => {
    if (!selectedMessage || !roomId || !socketRef.current) return;
    
    const text = selectedMessage.text;
    const oldId = selectedMessage.id;
    
    // Remove failed message
    setMessages((prev) => prev.filter((m) => m.id !== oldId));
    
    // Create new optimistic message with unique ID
    const optimisticId = `opt-${Date.now()}-${Math.random()}`;
    const optimistic = { id: optimisticId, from: "me", text, ts: Date.now(), sending: true, failed: false };
    setMessages((prev) => [...prev, optimistic]);

    // Set timeout to mark as failed after 10 seconds
    const failTimeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId && m.sending ? { ...m, sending: false, failed: true } : m))
      );
    }, 10000);

    try {
      socketRef.current.emit("send_message", { roomId, senderId: String(myId), body: text });
      
      // Clear timeout after a short delay
      setTimeout(() => {
        clearTimeout(failTimeout);
      }, 1000);
    } catch {
      clearTimeout(failTimeout);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, sending: false, failed: true } : m))
      );
      return;
    }
  }, [selectedMessage, roomId, myId]);

  const handleTyping = useCallback((text) => {
    if (!roomId || !socketRef.current) return;
    
    if (text.trim().length > 0) {
      // User is typing
      try {
        socketRef.current.emit("typing_start", { roomId, userId: String(myId) });
      } catch { }
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        try {
          socketRef.current.emit("typing_stop", { roomId, userId: String(myId) });
        } catch { }
      }, 3000);
    } else {
      // User cleared input
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      try {
        socketRef.current.emit("typing_stop", { roomId, userId: String(myId) });
      } catch { }
    }
  }, [roomId, myId]);

  const uploadMedia = useCallback(async (file, type) => {
    if (!roomId) return null;
    
    try {
      console.log('Uploading media:', { type, fileName: file.name, mimeType: file.mimeType });
      
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        type: file.mimeType || file.type || "application/octet-stream",
        name: file.name || `upload_${Date.now()}.${file.uri.split(".").pop()}`,
      });
      formData.append("type", type);
      formData.append("conversationId", roomId);

      console.log('Sending upload request to:', `${CHAT_BASE}/api/chat/upload`);

      const response = await fetch(`${CHAT_BASE}/api/chat/upload`, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log('Upload response status:', response.status);

      const result = await response.json();
      console.log('Upload result:', result);
      
      if (result.success && result.data) {
        console.log('Upload successful, media URL:', result.data.url);
        return result.data;
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert("Upload Error", error.message || "Failed to upload media");
      return null;
    }
  }, [roomId]);

  const sendMediaMessage = useCallback(async (mediaData, type, caption = "") => {
    if (!roomId || !socketRef.current || !mediaData) return;

    // Optimistic message
    const optimisticId = `opt-${Date.now()}-${Math.random()}`;
    const optimistic = {
      id: optimisticId,
      from: "me",
      text: caption || "[Media]",
      ts: Date.now(),
      sending: true,
      failed: false,
      type: type,
      mediaUrl: mediaData.url,
    };
    setMessages((prev) => [...prev, optimistic]);

    // Set timeout to mark as failed after 10 seconds
    const failTimeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId && m.sending ? { ...m, sending: false, failed: true } : m))
      );
    }, 10000);

    try {
      socketRef.current.emit("send_media_message", {
        roomId,
        senderId: String(myId),
        body: caption || "[Media]",
        type: type,
        mediaUrl: mediaData.url,
        mediaData: {
          mimeType: mediaData.type,
          size: mediaData.size,
          width: mediaData.width,
          height: mediaData.height,
          duration: mediaData.duration,
        },
      });

      setTimeout(() => {
        clearTimeout(failTimeout);
      }, 1000);
    } catch {
      clearTimeout(failTimeout);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, sending: false, failed: true } : m))
      );
    }
  }, [roomId, myId]);

  const handleSelectMedia = useCallback(async (type, label) => {
    setTrayOpen(false);

    try {
      if (type === "image" || type === "video") {
        // Request permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Please grant media library access to send photos and videos.");
          return;
        }

        // Launch picker
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: type === "image" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
          allowsEditing: true,
          quality: 0.8,
          videoMaxDuration: 60,
        });

        if (!result.canceled && result.assets && result.assets[0]) {
          const asset = result.assets[0];
          
          // Show uploading indicator
          Alert.alert("Uploading", "Please wait...");
          
          // Upload media
          const uploadedData = await uploadMedia(
            {
              uri: asset.uri,
              mimeType: asset.type === "video" ? "video/mp4" : "image/jpeg",
              name: `${type}_${Date.now()}.${asset.type === "video" ? "mp4" : "jpg"}`,
            },
            type
          );

          if (uploadedData) {
            // Send media message
            await sendMediaMessage(uploadedData, type, "");
          }
        }
      } else if (type === "document") {
        // Launch document picker
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });

        if (result.type === "success" || !result.canceled) {
          const file = result.assets ? result.assets[0] : result;
          
          Alert.alert("Uploading", "Please wait...");
          
          const uploadedData = await uploadMedia(
            {
              uri: file.uri,
              mimeType: file.mimeType || "application/octet-stream",
              name: file.name,
            },
            "document"
          );

          if (uploadedData) {
            await sendMediaMessage(uploadedData, "document", file.name);
          }
        }
      } else if (type === "voice") {
        Alert.alert("Voice Recording", "Voice recording feature coming soon.");
      }
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to select media");
    }
  }, [uploadMedia, sendMediaMessage]);

  // ── Render ────────────────────────────────────────────────────────────────

  const listData = useMemo(() => buildListData(messages, isTyping), [messages, isTyping]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === "date") return <DateSeparator label={item.label} />;
    if (item.type === "typing") return <TypingIndicator />;
    return (
      <MessageBubble
        item={item}
        isFirst={item.isFirst}
        isLast={item.isLast}
        showTimestamp={item.showTimestamp}
        onLongPress={handleLongPress}
      />
    );
  }, [handleLongPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const getItemLayout = useCallback((_, index) => ({
    length: 60,
    offset: 60 * index,
    index,
  }), []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ChatHeader
        username={username}
        profilePicUrl={profilePicUrl}
        userId={userId}
        isOnline={isOnline}
        isTyping={isTyping}
        canGoBack={canGoBack}
        onBack={() => navigation.goBack()}
        onNavigateProfile={() => navigation.navigate("Profile", { userId })}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onScrollBeginDrag={() => setTrayOpen(false)}
          onScroll={(e) => {
            const y = e?.nativeEvent?.contentOffset?.y || 0;
            if (y <= 40 && roomId && !moreLoading) fetchOlder();
          }}
          scrollEventThrottle={32}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            moreLoading ? (
              <View style={styles.loadMoreWrap}>
                <Text style={styles.loadMoreText}>Loading earlier messages…</Text>
              </View>
            ) : null
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          removeClippedSubviews={Platform.OS === "android"}
          maxToRenderPerBatch={20}
          windowSize={10}
          initialNumToRender={20}
        />

        <AttachmentTray visible={trayOpen} onClose={() => setTrayOpen(false)} onSelectMedia={handleSelectMedia} />

        <MessageInput
          draft={draft}
          setDraft={setDraft}
          onSend={sendMessage}
          sending={sending}
          trayOpen={trayOpen}
          setTrayOpen={setTrayOpen}
          insetBottom={0}
          onTyping={handleTyping}
        />
      </KeyboardAvoidingView>

      <MessageActionsModal
        visible={modalVisible}
        message={selectedMessage}
        onClose={() => setModalVisible(false)}
        onReact={() => {}}
        onReply={() => {}}
        onDelete={() => {
          if (selectedMessage && roomId && socketRef.current) {
            // Emit delete event to server
            try {
              socketRef.current.emit("delete_message", {
                messageId: selectedMessage.id,
                conversationId: roomId,
                userId: String(myId)
              });
            } catch { }
            // Optimistically update UI
            setMessages((prev) => prev.map((m) => m.id === selectedMessage.id ? { ...m, deleted: true } : m));
          }
        }}
        onRetry={handleRetry}
      />
    </SafeAreaView>
  );
}

// ─── Normalizer ────────────────────────────────────────────────────────────────

function normalizeMessages(list, myId) {
  return list.map((m, idx) => {
    const sid = m.sender_id || m.sender || m.user_id || m.from;
    const content = m.body || m.content || m.text || "";
    const time = m.created_at || m.timestamp || m.time || Date.now();
    return {
      id: m.id || `msg-${idx}-${time}`,
      from: String(sid) === String(myId) ? "me" : "other",
      text: content,
      ts: typeof time === "number" ? time : Date.parse(time) || Date.now(),
      read: m.read || false,
      type: m.type || "text",
      mediaUrl: m.media_url || m.mediaUrl || null,
      deleted: m.is_deleted || m.deleted || false,
    };
  });
}

// ─── Root Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  listContent: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  loadMoreWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },
  loadMoreText: {
    fontFamily: "Montserrat_600SemiBold",
    color: theme.textSecondary,
    fontSize: 11,
  },
});