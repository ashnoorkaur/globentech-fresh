import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import {
    adminMenu,
    customerMenu,
    guestMenu,
    technicianMenu,
} from "../constants/role-menus";
import type { NotificationCategory } from "../lib/notifications-store";
import {
    markAllNotificationsRead,
    useNotificationsState,
} from "../lib/notifications-store";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function NotificationsPage() {
  const theme = useAppTheme();
  const session = useSessionState();
  const notifications = useNotificationsState();
  const [activeFilter, setActiveFilter] = useState<
    "all" | NotificationCategory
  >("all");

  useEffect(() => {
    markAllNotificationsRead();
  }, []);

  const menuItems = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return adminMenu;
    if (role === "technician") return technicianMenu;
    if (role === "customer") return customerMenu;
    return guestMenu;
  }, [session.user?.role]);

  const dashboardRoute = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return "/admin-dashboard" as const;
    if (role === "technician") return "/technician-dashboard" as const;
    if (role === "customer") return "/customer-dashboard" as const;
    return "/login" as const;
  }, [session.user?.role]);

  const roleLabel = useMemo(() => {
    const role = session.user?.role;
    if (!role) return "Guest";
    if (role === "administrator") return "Admin";
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [session.user?.role]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return notifications.items;
    return notifications.items.filter((item) => item.category === activeFilter);
  }, [notifications.items, activeFilter]);

  const filters: { key: "all" | NotificationCategory; label: string }[] = [
    { key: "all", label: "All" },
    { key: "orders", label: "Orders" },
    { key: "roles", label: "Role Changes" },
    { key: "system", label: "System" },
  ];

  return (
    <RoleContentPage
      title="Notifications"
      subtitle="Order updates, status changes, and role-related alerts."
      role={roleLabel}
      activeKey="notifications"
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
      leftActionMode="back"
      onLeftActionPress={() => router.push(dashboardRoute)}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.filterRow}>
          {filters.map((filter) => {
            const active = filter.key === activeFilter;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(filter.key)}
                style={[
                  styles.filterBtn,
                  {
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                    backgroundColor: active
                      ? theme.colors.primarySoft
                      : theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: active
                        ? theme.colors.primary
                        : theme.colors.textMuted,
                    },
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {filteredItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color={theme.colors.textMuted}
            />
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              No notifications in this category.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {filteredItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (item.targetRoute) {
                    router.push(item.targetRoute as never);
                  }
                }}
                style={[
                  styles.item,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: item.read
                      ? theme.colors.surfaceMuted
                      : theme.colors.primarySoft,
                  },
                ]}
              >
                <Text style={[styles.itemTitle, { color: theme.colors.text }]}>
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.itemMessage,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {item.message}
                </Text>
                <Text
                  style={[styles.itemTime, { color: theme.colors.textMuted }]}
                >
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  {new Date(item.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 14, minHeight: 220 },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  filterBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterText: { fontSize: 11, fontWeight: "800" },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: { fontSize: 13, fontWeight: "700" },
  item: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  itemTitle: { fontSize: 14, fontWeight: "800" },
  itemMessage: { fontSize: 12, lineHeight: 17 },
  itemTime: { fontSize: 11, fontWeight: "700" },
});
