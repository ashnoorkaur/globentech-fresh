import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import { fetchPendingOrders } from "../lib/admin-api";
import {
    fetchTechnicianWorkQueue,
    type QueueEntry,
} from "../lib/calendar-api";
import { toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

const isPendingApproval = (entry: QueueEntry) => {
  const status = toLifecycleStatus(entry.order_status);
  return status === "payment_pending";
};

const dedupeQueue = (entries: QueueEntry[]) => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = (
      entry.order_number || `${entry.order_id || entry.queue_id}`
    )
      .trim()
      .toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const SHARED_PENDING_COUNT_KEY = "technician:pendingCount:v1";
const SHARED_QUEUE_COUNT_KEY = "technician:queueCount:v1";
const SHARED_UPDATED_KEY = "technician:lastUpdated:v1";

export default function TechnicianDashboardPage() {
  const theme = useAppTheme();
  const [queue, setQueue] = useCachedScreenState<QueueEntry[]>(
    "technician-dashboard:queue:v8",
    [],
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("technician-dashboard:queue:v8"),
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    SHARED_UPDATED_KEY,
    "",
  );
  const [websitePendingCount, setWebsitePendingCount] = useCachedScreenState(
    SHARED_PENDING_COUNT_KEY,
    0,
  );
  const [websiteQueueCount, setWebsiteQueueCount] = useCachedScreenState(
    SHARED_QUEUE_COUNT_KEY,
    0,
  );

  const loadQueue = useCallback(async () => {
    if (queue.length === 0) {
      setLoading(true);
    }
    try {
      const [data, pendingOrders] = await Promise.all([
        fetchTechnicianWorkQueue(),
        fetchPendingOrders().catch(() => []),
      ]);
      const uniqueQueue = dedupeQueue(data.queue ?? []);
      const pendingQueue = uniqueQueue.filter((entry) => isPendingApproval(entry));
      const livePendingCount =
        typeof data.dashboardPendingCount === "number" && data.dashboardPendingCount > 0
          ? data.dashboardPendingCount
          : undefined;
      const resolvedPendingCount = pendingOrders.length > 0
        ? livePendingCount
          ? Math.min(pendingOrders.length, livePendingCount)
          : pendingOrders.length
        : (livePendingCount ?? pendingQueue.length);

      setQueue(uniqueQueue);
      setWebsitePendingCount(resolvedPendingCount);
      setWebsiteQueueCount(
        typeof data.dashboardQueueCount === "number" && data.dashboardQueueCount > 0
          ? data.dashboardQueueCount
          : uniqueQueue.length,
      );
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
    }
  }, [queue.length, setLastUpdated, setQueue, setWebsitePendingCount, setWebsiteQueueCount]);

  useFocusedPolling(loadQueue, { intervalMs: 12000 });

  const stats = useMemo(() => {
    const pendingFallback = dedupeQueue(queue).filter((entry) => isPendingApproval(entry)).length;

    return {
      pendingApprovals: websitePendingCount > 0 ? websitePendingCount : pendingFallback,
      inQueue: websiteQueueCount > 0 ? websiteQueueCount : queue.length,
    };
  }, [queue, websitePendingCount, websiteQueueCount]);

  const cards = [
    {
      key: "approvals",
      title: "Pending Approvals",
      description: "Payment-cleared orders ready for technician acceptance.",
      value:
        loading && !lastUpdated && stats.pendingApprovals === 0
          ? "..."
          : `${stats.pendingApprovals}`,
      footer: "Review now",
      route: "/technician-tasks" as const,
      color: theme.colors.primary,
    },
    {
      key: "calendar",
      title: "Calendar",
      description: "See assigned queue items and scheduled technician work.",
      value:
        loading && !lastUpdated && stats.inQueue === 0
          ? "..."
          : `${stats.inQueue}`,
      footer: "Open queue",
      route: "/technician-calendar" as const,
      color: theme.colors.secondary,
    },
  ];

  return (
    <RoleContentPage
      title="Dashboard"
      subtitle=""
      activeKey="dashboard"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
      role="Technician"
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
        <View style={styles.topRow}>
          <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>
            Updated: {lastUpdated || (loading ? "Loading..." : "--")}
          </Text>
          <View
            style={[
              styles.syncBadge,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.primarySoft,
              },
            ]}
          >
            <Text style={[styles.syncBadgeText, { color: theme.colors.primary }]}>Live Sync</Text>
          </View>
        </View>

        <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>
          Review technician approvals and manage today’s active queue from here.
        </Text>

        <View style={styles.grid}>
          {cards.map((item) => (
            <View
              key={item.key}
              style={[
                styles.featureCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
                {item.title}
              </Text>
              <Text style={[styles.featureDesc, { color: theme.colors.textMuted }]}>
                {item.description}
              </Text>
              <Text style={[styles.featureValue, { color: item.color }]}>
                {item.value}
              </Text>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: item.color }]}
                onPress={() => router.push(item.route)}
              >
                <Text style={styles.actionBtnText}>{item.footer}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  updatedText: { fontSize: 12, fontWeight: "700" },
  syncBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  syncBadgeText: { fontSize: 11, fontWeight: "800" },
  statusText: { fontSize: 12, fontWeight: "700" },
  grid: { gap: 12 },
  featureCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  featureTitle: { fontSize: 17, fontWeight: "800" },
  featureDesc: { fontSize: 13, lineHeight: 20 },
  featureValue: { fontSize: 26, fontWeight: "800" },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
