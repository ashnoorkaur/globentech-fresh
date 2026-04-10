import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  appendChatMessages,
  useChatSession,
  type ChatMessage,
} from "../lib/chatbot-session";
import { useAppTheme } from "../lib/theme";

const getAiReply = (input: string) => {
  const text = input.toLowerCase();

  if (text.includes("order")) {
    return "To manage orders, open My Orders or Order History from the menu. I can also guide you step by step.";
  }

  if (text.includes("approval") || text.includes("admin")) {
    return "Admin approvals are handled in the Approvals page. Use the top-left menu to switch quickly.";
  }

  if (text.includes("equipment")) {
    return "Equipment operations are available in the Equipment section. You can view list, add entries, and refresh data.";
  }

  if (text.includes("calendar") || text.includes("schedule")) {
    return "Schedule and planning are under Calendar. Open menu and choose Calendar for your role.";
  }

  if (text.includes("report")) {
    return "Reports can be generated in the Reports page by selecting type and option.";
  }

  return "I can help with orders, approvals, equipment, reports, and navigation. Ask me what you want to do.";
};

export default function ChatbotPage() {
  const theme = useAppTheme();
  const [input, setInput] = useState("");
  const { messages } = useChatSession();

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const sendMessage = () => {
    const value = input.trim();
    if (!value) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      from: "user",
      text: value,
    };

    const aiMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      from: "ai",
      text: getAiReply(value),
    };

    appendChatMessages([userMsg, aiMsg]);
    setInput("");
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={[styles.header, { borderBottomColor: theme.colors.border }]}
        >
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            AI Chatbot
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={[
              styles.closeBtn,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Ionicons name="close" size={18} color={theme.colors.text} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.listWrap}
          contentContainerStyle={styles.listContent}
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.message,
                msg.from === "user"
                  ? { backgroundColor: theme.colors.primary }
                  : {
                      backgroundColor: theme.colors.surfaceMuted,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                    },
                msg.from === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  { color: msg.from === "user" ? "#fff" : theme.colors.text },
                ]}
              >
                {msg.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View
          style={[styles.inputRow, { borderTopColor: theme.colors.border }]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type your message..."
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
              },
            ]}
          />

          <Pressable
            onPress={sendMessage}
            disabled={!canSend}
            style={[
              styles.sendBtn,
              {
                backgroundColor: canSend
                  ? theme.colors.primary
                  : theme.colors.border,
              },
            ]}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    height: "58%",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listWrap: { flex: 1 },
  listContent: { gap: 8, padding: 12 },
  message: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: "88%",
  },
  userBubble: { alignSelf: "flex-end" },
  aiBubble: { alignSelf: "flex-start" },
  messageText: { fontSize: 13, lineHeight: 18 },
  inputRow: { padding: 10, gap: 8, borderTopWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  sendBtnText: { color: "#fff", fontWeight: "800" },
});
