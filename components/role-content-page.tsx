import { Ionicons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuItem } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { logoutSession } from "../lib/auth-api";
import { clearChatSession } from "../lib/chatbot-session";
import {
    clearNotifications,
    getUnreadNotificationsCount,
    syncNotificationsForRole,
    useNotificationsState,
} from "../lib/notifications-store";
import { setSessionUser, useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";
import { RoleMenuModal } from "./role-menu-modal";
import { TopStripNav } from "./top-strip-nav";

type RoleContentPageProps = {
  title: string;
  subtitle: string;
  activeKey: string;
  menuItems: MenuItem[];
  dashboardRoute: Href;
  role?: string;
  leftActionMode?: "menu" | "back";
  onLeftActionPress?: () => void;
  children?: ReactNode;
};

export function RoleContentPage({
  title,
  subtitle,
  activeKey,
  menuItems,
  dashboardRoute,
  role,
  leftActionMode = "menu",
  onLeftActionPress,
  children,
}: RoleContentPageProps) {
  const theme = useAppTheme();
  const session = useSessionState();
  const notifications = useNotificationsState();
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  const confirm = useConfirmModal();

  const unreadCount = useMemo(() => {
    const storeCount = getUnreadNotificationsCount();
    if (storeCount > 0) return storeCount;
    return notifications.items.filter((item) => !item.read).length;
  }, [notifications.items]);

  useEffect(() => {
    const roleValue = session.user?.role;
    void syncNotificationsForRole(roleValue);
    const timer = setInterval(() => {
      void syncNotificationsForRole(roleValue);
    }, 12000);

    return () => clearInterval(timer);
  }, [session.user?.role]);

  const onLogout = async () => {
    confirm.openConfirm({
      title: "Confirm Logout",
      message: "Are you sure you want to log out from this account?",
      confirmText: "Logout",
      variant: "error",
      onConfirm: async () => {
        try {
          await logoutSession();
        } finally {
          clearChatSession();
          clearNotifications();
          setSessionUser(null);
          router.replace("/login");
        }
      },
    });
  };

  const adminInnerPage =
    role === "Admin" &&
    [
      "approvals",
      "calendar",
      "order-history",
      "users",
      "equipment",
      "reports",
      "about",
    ].includes(activeKey);

  const roleInnerPage =
    (role === "Customer" || role === "Technician") && activeKey !== "dashboard";

  const showHeaderBack = adminInnerPage || roleInnerPage;

  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 4,
        },
      ]}
    >
      <View
        style={[
          styles.bgBlobTop,
          { backgroundColor: theme.colors.backgroundDesignA },
        ]}
      />
      <View
        style={[
          styles.bgBlobBottom,
          { backgroundColor: theme.colors.backgroundDesignB },
        ]}
      />

      <TopStripNav
        onOpenMenu={() => setMenuVisible(true)}
        role={role}
        leftMode={leftActionMode}
        onLeftPress={
          onLeftActionPress ??
          (leftActionMode === "menu" ? () => setMenuVisible(true) : undefined)
        }
        hideBrand={showHeaderBack}
        rightMode="profile"
        colors={theme.colors}
      />

      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.heroAccent]} />
          {showHeaderBack ? (
            <Pressable
              onPress={() => router.push(dashboardRoute)}
              style={styles.eyebrowRow}
            >
              <View
                style={[
                  styles.backChip,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Ionicons
                  name="arrow-back"
                  size={14}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>
                GlobenTech
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>
              GlobenTech
            </Text>
          )}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {title}
            </Text>
            {activeKey === "dashboard" ? (
              <Pressable
                onPress={() => router.push("/notifications")}
                style={[
                  styles.titleBell,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={theme.colors.primary}
                />
                {unreadCount > 0 ? (
                  <View style={styles.titleBadge}>
                    <Text style={styles.titleBadgeText}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {subtitle}
          </Text>
        </View>
        {children}
      </ScrollView>

      {leftActionMode === "menu" ? (
        <RoleMenuModal
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          items={menuItems}
          activeKey={activeKey}
          colors={theme.colors}
          onLogout={role && role !== "Guest" ? onLogout : undefined}
          role={role}
        />
      ) : null}

      {activeKey !== "chatbot" ? (
        <Pressable
          onPress={() => router.push("/chatbot")}
          style={[styles.chatFab, { backgroundColor: theme.colors.secondary }]}
        >
          <Ionicons name="sparkles-outline" size={20} color="#fff" />
        </Pressable>
      ) : null}

      {confirm.modal}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bgBlobTop: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    right: -80,
    top: -90,
    opacity: 0.48,
  },
  bgBlobBottom: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    left: -100,
    bottom: -115,
    opacity: 0.4,
  },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#433B84",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: "hidden",
  },
  heroAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "#6A73F6",
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingRight: 8,
    borderRadius: 999,
    marginBottom: 8,
  },
  backChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 0,
    marginBottom: 0,
  },
  title: { fontSize: 30, fontWeight: "800", marginBottom: 8 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titleBell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBadge: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E13A4B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  titleBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  subtitle: { fontSize: 15, lineHeight: 22 },
  chatFab: {
    position: "absolute",
    right: 18,
    bottom: 26,
    height: 52,
    width: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1F1C4A",
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
});
