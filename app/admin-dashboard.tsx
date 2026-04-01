import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
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
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { auth, db } from "../firebase/config";
import { useAppTheme } from "../lib/theme";

type ChatMessage = {
  id: string;
  sender: "user" | "assistant";
  text: string;
};

type AdminAction = {
  title: string;
  description: string;
  meta: string;
  button: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
};

const initialMessages: ChatMessage[] = [
  {
    id: "admin-welcome",
    sender: "assistant",
    text: "Admin assistant ready. Ask about approvals, users, equipment, reports, or system controls.",
  },
];

const buildReply = (input: string) => {
  const text = input.toLowerCase();

  if (text.includes("approval")) {
    return "You can review incoming approvals from the Approvals section and track pending requests from the dashboard cards.";
  }

  if (text.includes("user") || text.includes("permission")) {
    return "Use User Management to update roles and permissions for customer and technician accounts.";
  }

  if (text.includes("equipment")) {
    return "Equipment Management handles schedules, availability, and maintenance status updates.";
  }

  if (text.includes("report") || text.includes("analytics")) {
    return "Open Reports to inspect system metrics, workloads, and operational performance.";
  }

  return "I can help with approvals, user administration, equipment setup, and report navigation.";
};

export default function AdminDashboard() {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("System Administrator");
  const [menuVisible, setMenuVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  useEffect(() => {
    const checkRole = async () => {
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

        if (userData.role === "customer") {
          router.replace("/customer-dashboard");
          return;
        }

        if (userData.role === "technician") {
          router.replace("/technician-dashboard");
          return;
        }

        if (userData.role !== "admin") {
          router.replace("/login");
          return;
        }

        setName(userData.name || "System Administrator");
        setLoading(false);
      } catch {
        router.replace("/login");
      }
    };

    checkRole();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleSend = () => {
    const trimmed = chatInput.trim();

    if (!trimmed) return;

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

  const actions = useMemo<AdminAction[]>(
    () => [
      {
        title: "Pending Approvals",
        description: "Orders waiting for approval",
        meta: "0 Pending",
        button: "Review Orders",
        icon: "clipboard-check-outline",
        onPress: () => undefined,
      },
      {
        title: "User Management",
        description: "Manage user accounts and permissions",
        meta: "Manage Users",
        button: "Manage Users",
        icon: "account-group-outline",
        onPress: () => router.push("/profile"),
      },
      {
        title: "Equipment Management",
        description: "Configure equipment settings and schedules",
        meta: "Manage Equipment",
        button: "Manage Equipment",
        icon: "tools",
        onPress: () => undefined,
      },
      {
        title: "Reports & Analytics",
        description: "View system statistics and performance",
        meta: "View Reports",
        button: "View Reports",
        icon: "chart-box-outline",
        onPress: () => undefined,
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

      <View
        style={[
          styles.headerRow,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setMenuVisible(true)}
        >
          <Ionicons name="menu" size={26} color={theme.colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.profileBadge}
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
            System Administrator
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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

            <GradientButton style={styles.cardButton} onPress={item.onPress}>
              <Text style={styles.cardButtonText}>{item.button}</Text>
            </GradientButton>
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
            Pending Orders
          </Text>
          <Text style={[styles.systemLine, { color: theme.colors.textMuted }]}>
            No pending orders
          </Text>
          <Text
            style={[
              styles.systemTitle,
              { color: theme.colors.text, marginTop: 12 },
            ]}
          >
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
        items={adminMenu}
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
                  Admin support chat
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
                placeholder="Ask about approvals, users, or reports..."
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
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
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
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  profileBadgeText: { fontSize: 15, fontWeight: "800" },
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
  heroTitle: { fontSize: 30, fontWeight: "800", marginBottom: 6 },
  heroSubtitle: { fontSize: 16, lineHeight: 22 },
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
  cardMeta: { fontSize: 12, fontWeight: "700" },
  cardTitle: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  cardDescription: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  cardButton: { borderRadius: 14, overflow: "hidden" },
  cardButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
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
  systemTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  systemLine: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
  systemNote: { fontSize: 13, lineHeight: 20, marginTop: 8 },
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
  chatTitle: { fontSize: 19, fontWeight: "800" },
  chatSubtitle: { fontSize: 13, marginTop: 2 },
  chatMessages: { flexGrow: 0, marginBottom: 14 },
  messageBubble: {
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    marginBottom: 10,
  },
  userBubble: { alignSelf: "flex-end" },
  assistantBubble: { alignSelf: "flex-start", borderWidth: 1 },
  messageText: { fontSize: 14, lineHeight: 20 },
  chatComposer: { gap: 10 },
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
  sendButton: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
