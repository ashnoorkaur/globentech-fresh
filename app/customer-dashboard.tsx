import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { get, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ProjectFooter } from "../components/project-footer";
import { RoleMenuModal } from "../components/role-menu-modal";
import { customerMenu } from "../constants/role-menus";
import { auth, db } from "../firebase/config";
import { useAppTheme } from "../lib/theme";

type ChatMessage = {
  id: string;
  sender: "user" | "assistant";
  text: string;
};

type ActionCard = {
  title: string;
  description: string;
  meta: string;
  button: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    sender: "assistant",
    text: "Hi. I can help with orders, account settings, and contact requests.",
  },
];

const buildReply = (input: string) => {
  const text = input.toLowerCase();

  if (text.includes("order") || text.includes("history")) {
    return "Use My Orders to track active requests and Order History to review completed results.";
  }

  if (text.includes("new") || text.includes("submit")) {
    return "Open New Order to submit a chemical testing request with your sample details.";
  }

  if (
    text.includes("account") ||
    text.includes("profile") ||
    text.includes("settings")
  ) {
    return "Open Account Settings to manage your theme, profile details, password, and account actions.";
  }

  if (text.includes("contact") || text.includes("help")) {
    return "Use this assistant for support right now. Contact options can be expanded later if needed.";
  }

  return "I can help with orders, history, new requests, account settings, and dashboard navigation.";
};

export default function CustomerDashboard() {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Test Customer");
  const [menuVisible, setMenuVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  useEffect(() => {
    const checkUser = async () => {
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snapshot = await get(ref(db, `users/${user.uid}`));
        const userData = snapshot.val();

        if (!userData) {
          router.replace("/login");
          return;
        }

        if (userData.role === "admin") {
          router.replace("/admin-dashboard");
          return;
        }

        if (userData.role === "technician") {
          router.replace("/technician-dashboard");
          return;
        }

        setName(userData.name || "Test Customer");
        setLoading(false);
      } catch {
        router.replace("/login");
      }
    };

    checkUser();
  }, []);

  const handleSend = () => {
    const trimmed = chatInput.trim();

    if (!trimmed) {
      return;
    }

    const stamp = Date.now().toString();
    setMessages((current) => [
      ...current,
      { id: `${stamp}-user`, sender: "user", text: trimmed },
      {
        id: `${stamp}-assistant`,
        sender: "assistant",
        text: buildReply(trimmed),
      },
    ]);
    setChatInput("");
  };

  const actions = useMemo<ActionCard[]>(
    () => [
      {
        title: "My Orders",
        description: "View and track your chemical compound orders",
        meta: "0 Active",
        button: "View Orders",
        icon: "clipboard-text-clock-outline",
        onPress: () => router.push("/my-orders"),
      },
      {
        title: "Order History",
        description: "Review completed submissions and result history",
        meta: "0 Completed",
        button: "View History",
        icon: "history",
        onPress: () => router.push("/orders"),
      },
      {
        title: "New Order",
        description: "Submit a new chemical testing request",
        meta: "New Request",
        button: "Create Order",
        icon: "flask-outline",
        onPress: () => router.push("/create-order"),
      },
      {
        title: "Contact Us",
        description: "Reach support and get help with your requests",
        meta: "Need Help?",
        button: "Open Chat",
        icon: "message-outline",
        onPress: () => setChatVisible(true),
      },
    ],
    [],
  );

  if (loading) {
    return (
      <View
        style={[styles.loader, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.bgBubbleTop,
          { backgroundColor: theme.colors.primarySoft },
        ]}
      />
      <View
        style={[
          styles.bgBubbleBottom,
          { backgroundColor: theme.colors.primarySoft },
        ]}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[
              styles.iconButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => setMenuVisible(true)}
          >
            <Ionicons name="menu" size={24} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.profileBadge,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => router.push("/settings")}
          >
            <Ionicons
              name="person-circle-outline"
              size={26}
              color={theme.colors.primary}
            />
            <Text
              style={[styles.profileBadgeText, { color: theme.colors.primary }]}
            >
              Customer
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.heroBrand, { color: theme.colors.primary }]}>
            GlobenTech
          </Text>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
            Dashboard
          </Text>
          <Text
            style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}
          >
            Welcome, {name}!
          </Text>
        </View>

        {actions.map((item) => (
          <View
            key={item.title}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.cardTopRow}>
              <View
                style={[
                  styles.cardIconWrap,
                  { backgroundColor: theme.colors.primarySoft },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={[styles.cardMeta, { color: theme.colors.primary }]}>
                {item.meta}
              </Text>
            </View>

            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              {item.title}
            </Text>
            <Text
              style={[
                styles.cardDescription,
                { color: theme.colors.textMuted },
              ]}
            >
              {item.description}
            </Text>

            <TouchableOpacity
              style={[
                styles.cardButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={item.onPress}
            >
              <Text style={styles.cardButtonText}>{item.button}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View
          style={[
            styles.systemCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.systemTitle, { color: theme.colors.text }]}>
            System Information
          </Text>
          <Text style={[styles.systemLine, { color: theme.colors.textMuted }]}>
            Project: Phase 3 Prototype
          </Text>
          <Text style={[styles.systemLine, { color: theme.colors.textMuted }]}>
            Status: Development
          </Text>
          <Text style={[styles.systemNote, { color: theme.colors.textMuted }]}>
            Note: This is a school project prototype demonstrating core
            functionality.
          </Text>
        </View>

        <ProjectFooter colors={theme.colors} />
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => setChatVisible(true)}
      >
        <Ionicons name="sparkles-outline" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <RoleMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={customerMenu}
        activeKey="dashboard"
        colors={theme.colors}
      />

      <Modal
        transparent
        animationType="slide"
        visible={chatVisible}
        onRequestClose={() => setChatVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setChatVisible(false)}
          />
          <View
            style={[
              styles.chatSheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.chatHeader}>
              <View>
                <Text style={[styles.chatTitle, { color: theme.colors.text }]}>
                  AI Assistant
                </Text>
                <Text
                  style={[
                    styles.chatSubtitle,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Chat support for customer actions
                </Text>
              </View>
              <TouchableOpacity onPress={() => setChatVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.chatMessages}
              showsVerticalScrollIndicator={false}
            >
              {messages.map((message) => {
                const isUser = message.sender === "user";

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      isUser
                        ? [
                            styles.userBubble,
                            { backgroundColor: theme.colors.primary },
                          ]
                        : [
                            styles.assistantBubble,
                            {
                              backgroundColor: theme.colors.inputBg,
                              borderColor: theme.colors.border,
                            },
                          ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        { color: isUser ? "#FFFFFF" : theme.colors.text },
                      ]}
                    >
                      {message.text}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.chatComposer}>
              <TextInput
                style={[
                  styles.chatInput,
                  {
                    backgroundColor: theme.colors.inputBg,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask about orders, settings, or support..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleSend}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bgBubbleTop: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -70,
    top: -95,
    opacity: 0.45,
  },
  bgBubbleBottom: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    left: -80,
    bottom: -110,
    opacity: 0.35,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  profileBadgeText: {
    fontSize: 15,
    fontWeight: "800",
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 22,
    marginBottom: 16,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroBrand: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  cardButton: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  cardButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  systemCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginTop: 2,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  systemTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  systemLine: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  systemNote: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    right: 22,
    bottom: 26,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.22)",
    justifyContent: "flex-start",
    paddingTop: 92,
    paddingLeft: 20,
    paddingRight: 80,
  },
  menuPanel: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  menuItem: {
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  chatSheet: {
    minHeight: "62%",
    maxHeight: "78%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  chatTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  chatSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  chatMessages: {
    flexGrow: 0,
    marginBottom: 14,
  },
  messageBubble: {
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  chatComposer: {
    gap: 10,
  },
  chatInput: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 52,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  sendButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
