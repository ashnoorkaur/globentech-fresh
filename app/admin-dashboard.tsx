import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import {
    fetchAdminUsers,
    fetchPendingOrders,
    type AdminUserDto,
    type PendingOrderDto,
} from "../lib/admin-api";
import { fetchCalendarData, type QueueEntry } from "../lib/calendar-api";
import { useNotificationsState } from "../lib/notifications-store";
import { normalizeOrderStatusForCompare } from "../lib/order-status-normalize";
import { useAppTheme } from "../lib/theme";

export default function AdminDashboardPage() {
  const theme = useAppTheme();
  const notifications = useNotificationsState();
  const [orders, setOrders] = useCachedScreenState<PendingOrderDto[]>(
    "admin-dashboard:orders",
    [],
  );
  const [queue, setQueue] = useCachedScreenState<QueueEntry[]>(
    "admin-dashboard:queue",
    [],
  );
  const [users, setUsers] = useCachedScreenState<AdminUserDto[]>(
    "admin-dashboard:users",
    [],
  );
  const [equipmentCount, setEquipmentCount] = useCachedScreenState<number>(
    "admin-dashboard:equipmentCount",
    0,
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("admin-dashboard:orders"),
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-dashboard:lastUpdated",
    "",
  );

  const loadLiveData = useCallback(async () => {
    if (orders.length === 0 && queue.length === 0 && users.length === 0) {
      setLoading(true);
    }
    try {
      // DON'T clear cache - we want to use pre-warmed data from login
      // Only clear if this is a manual refresh (coming back to dashboard)
      
      // Load all data in parallel but allow partial success
      const [pendingOrdersResult, adminUsersResult, calendarDataResult] = await Promise.allSettled([
        fetchPendingOrders(),
        fetchAdminUsers(),
        fetchCalendarData(),
      ]);

      // Extract successful results or use empty arrays/objects as fallback
      const pendingOrders = pendingOrdersResult.status === "fulfilled" 
        ? pendingOrdersResult.value 
        : [];
      
      const adminUsers = adminUsersResult.status === "fulfilled" 
        ? adminUsersResult.value 
        : [];
      
      const calendarData = calendarDataResult.status === "fulfilled" 
        ? calendarDataResult.value 
        : { queue: [], equipment: [] };

      setOrders(pendingOrders);
      setUsers(adminUsers);
      setQueue(calendarData.queue ?? []);
      setEquipmentCount(calendarData.equipment?.length ?? 0);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
    }
  }, [orders.length, queue.length, setEquipmentCount, setLastUpdated, setOrders, setQueue, setUsers, users.length]);

  useFocusedPolling(loadLiveData, { intervalMs: 20000 });

  const stats = useMemo(() => {
    const total = orders.length;
    const high = orders.filter((o) => o.priority === "high").length;
    const usersCount = users.length;
    const completed = queue.filter(
      (q) => normalizeOrderStatusForCompare(q.order_status) === "completed",
    ).length;
    return { total, high, equipmentCount, usersCount, completed };
  }, [equipmentCount, orders, users, queue]);

  const recentNotifications = useMemo(
    () => notifications.items.slice(0, 3),
    [notifications.items],
  );

  const cards = [
    {
      title: "Pending Approvals",
      description: "Orders waiting for approval",
      metricLabel: "Pending",
      metricValue: String(stats.total),
      route: "/admin-approvals" as const,
      button: "Review Orders",
      color: theme.colors.primary,
    },
    {
      title: "Orders & Assignments",
      description: "Manage active order detail, queue state, and technician assignment",
      metricLabel: "Tracked",
      metricValue: String(queue.length),
      route: "/admin-order-history" as const,
      button: "Open Timeline",
      color: theme.colors.warning,
    },
    {
      title: "User Management",
      description: "Manage user accounts and permissions",
      metricLabel: "Users",
      metricValue: String(stats.usersCount),
      route: "/admin-users" as const,
      button: "Manage Users",
      color: theme.colors.secondary,
    },
    {
      title: "Equipment Management",
      description: "Configure equipment settings and schedules",
      metricLabel: "Equipment",
      metricValue: String(stats.equipmentCount),
      route: "/admin-equipment" as const,
      button: "Manage Equipment",
      color: theme.colors.buttonStart,
    },
    {
      title: "Reports & Analytics",
      description: "View system statistics and performance",
      metricLabel: "Completed",
      metricValue: loading ? "Sync" : String(stats.completed),
      route: "/admin-reports" as const,
      button: "View Reports",
      color: theme.colors.info,
    },
  ];

  return (
    <RoleContentPage
      title="Dashboard"
      subtitle="Live operational overview with real-time order updates."
      activeKey="dashboard"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
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
        <View
          style={[
            styles.liveBanner,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.liveBannerTitle, { color: theme.colors.text }]}>
            Operations Snapshot
          </Text>
          <Text
            style={[styles.liveBannerSub, { color: theme.colors.textMuted }]}
          >
            Updated {lastUpdated || "--"} · {loading ? "Syncing" : "Live"}
          </Text>
        </View>

        {cards.map((card) => (
          <View
            key={card.title}
            style={[
              styles.featureCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
              {card.title}
            </Text>
            <Text
              style={[styles.featureDesc, { color: theme.colors.textMuted }]}
            >
              {card.description}
            </Text>
            <View style={styles.featureStatRow}>
              <Text
                style={[
                  styles.featureStatLabel,
                  { color: theme.colors.textMuted },
                ]}
              >
                {card.metricLabel}
              </Text>
              <Text style={[styles.featureStatValue, { color: card.color }]}>
                {card.metricValue}
              </Text>
            </View>
            <GradientButton
              style={styles.featureBtn}
              onPress={() => router.push(card.route)}
              colors={["#4F7CFF", "#8C5BEA"]}
              compact
            >
              <Text style={styles.featureBtnText}>{card.button}</Text>
            </GradientButton>
          </View>
        ))}

        <View
          style={[
            styles.notificationsPanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <View style={styles.notificationsHeader}>
            <Text style={[styles.notificationsTitle, { color: theme.colors.text }]}>Recent Notifications</Text>
            <Text
              style={[styles.notificationsLink, { color: theme.colors.primary }]}
              onPress={() => router.push("/notifications")}
            >
              Open All
            </Text>
          </View>
          {recentNotifications.length === 0 ? (
            <Text style={[styles.notificationsEmpty, { color: theme.colors.textMuted }]}>No recent admin notifications.</Text>
          ) : (
            recentNotifications.map((item) => (
              <View key={item.id} style={styles.notificationRow}>
                <Text style={[styles.notificationTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.notificationMessage, { color: theme.colors.textMuted }]}>{item.message}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  liveBanner: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  liveBannerTitle: { fontSize: 14, fontWeight: "800" },
  liveBannerSub: { fontSize: 12, fontWeight: "700" },
  featureCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  featureTitle: { fontSize: 15, fontWeight: "800" },
  featureDesc: { fontSize: 12 },
  featureStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featureStatLabel: { fontSize: 12, fontWeight: "700" },
  featureStatValue: { fontSize: 18, fontWeight: "800" },
  featureBtn: {
    marginTop: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    minWidth: 140,
  },
  featureBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  notificationsPanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notificationsTitle: { fontSize: 15, fontWeight: "800" },
  notificationsLink: { fontSize: 12, fontWeight: "800" },
  notificationsEmpty: { fontSize: 12, fontWeight: "700" },
  notificationRow: { gap: 2 },
  notificationTitle: { fontSize: 12, fontWeight: "800" },
  notificationMessage: { fontSize: 11, lineHeight: 17 },
});
