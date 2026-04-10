import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import {
    fetchAdminUsers,
    fetchPendingOrders,
    type AdminUserDto,
    type PendingOrderDto,
} from "../lib/admin-api";
import { fetchCalendarData, type QueueEntry } from "../lib/calendar-api";
import { useAppTheme } from "../lib/theme";

export default function AdminDashboardPage() {
  const theme = useAppTheme();
  const [orders, setOrders] = useState<PendingOrderDto[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  const loadLiveData = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingOrders, adminUsers, calendarData] = await Promise.all([
        fetchPendingOrders(),
        fetchAdminUsers(),
        fetchCalendarData(),
      ]);
      setOrders(pendingOrders);
      setUsers(adminUsers);
      setQueue(calendarData.queue ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setOrders([]);
      setUsers([]);
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveData();
    const timer = setInterval(loadLiveData, 12000);
    return () => clearInterval(timer);
  }, [loadLiveData]);

  const stats = useMemo(() => {
    const total = orders.length;
    const high = orders.filter((o) => o.priority === "high").length;
    const companies = new Set([
      ...orders.map((o) => o.company_name || "Unknown"),
      ...queue.map((q) => q.order_number || "Unknown"),
    ]).size;
    const usersCount = users.length;
    const completed = queue.filter(
      (q) => (q.order_status || "").toLowerCase() === "completed",
    ).length;
    return { total, high, companies, usersCount, completed };
  }, [orders, users, queue]);

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
      metricLabel: "Companies",
      metricValue: String(stats.companies),
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
});
