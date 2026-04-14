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
import { fetchTechnicianWorkQueue, type QueueEntry } from "../lib/calendar-api";
import { useNotificationsState } from "../lib/notifications-store";
import { useAppTheme } from "../lib/theme";

const formatDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

export default function TechnicianDashboardPage() {
  const theme = useAppTheme();
  const notifications = useNotificationsState();
  const [queue, setQueue] = useCachedScreenState<QueueEntry[]>(
    "technician-dashboard:queue",
    [],
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("technician-dashboard:queue"),
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "technician-dashboard:lastUpdated",
    "",
  );

  const loadQueue = useCallback(async () => {
    if (queue.length === 0) {
      setLoading(true);
    }
    try {
      const data = await fetchTechnicianWorkQueue();
      setQueue(data.queue ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
    }
  }, [queue.length, setLastUpdated, setQueue]);

  useFocusedPolling(loadQueue, { intervalMs: 12000 });

  const taskStats = useMemo(() => {
    const processingQueue = queue.filter((q) => {
      const status = (q.order_status || "").toLowerCase();
      return !(status.includes("complete") || status.includes("result"));
    }).length;

    const completedToday = queue.filter((q) => {
      const status = (q.order_status || "").toLowerCase();
      if (!(status.includes("complete") || status.includes("result")))
        return false;
      const dateValue = q.estimated_completion || q.scheduled_end;
      if (!dateValue) return false;
      const d = new Date(dateValue);
      if (Number.isNaN(d.getTime())) return false;
      return d.toDateString() === new Date().toDateString();
    }).length;

    return {
      processingQueue,
      completedToday,
    };
  }, [queue]);

  const recentNotifications = useMemo(
    () => notifications.items.slice(0, 3),
    [notifications.items],
  );

  const cards = [
    {
      title: "Assigned Queue",
      description: "View and manage the technician work assigned to you",
      value: `${taskStats.processingQueue} active`,
      actionLabel: "View Calendar",
      route: "/technician-calendar" as const,
      color: theme.colors.primary,
    },
    {
      title: "Completed Today",
      description: "Orders completed in today\'s technician shift",
      value: `${taskStats.completedToday} Completed`,
      actionLabel: "View Tasks",
      route: "/technician-tasks" as const,
      color: theme.colors.success,
    },
    {
      title: "Log Delay",
      description: "Report queue delays or scheduling issues",
      value: queue[0]?.order_number
        ? `Next: ${queue[0].order_number}`
        : "No active queue",
      actionLabel: "Log Delay",
      route: "/technician-calendar" as const,
      color: theme.colors.secondary,
    },
  ];

  return (
    <RoleContentPage
      title="Dashboard"
      subtitle="Your live field workload and schedule snapshot."
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
        <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>
          Live sync: {lastUpdated || (loading ? "Loading..." : "--")}
        </Text>

        {cards.map((item) => (
          <View
            key={item.title}
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
            <Text
              style={[styles.featureDesc, { color: theme.colors.textMuted }]}
            >
              {item.description}
            </Text>
            <Text style={[styles.featureValue, { color: item.color }]}>
              {item.value}
            </Text>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: item.color }]}
              onPress={() => router.push(item.route)}
            >
              <Text style={styles.actionBtnText}>{item.actionLabel}</Text>
            </Pressable>
          </View>
        ))}

        <View
          style={[
            styles.queuePanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.queuePanelTitle, { color: theme.colors.text }]}>Assigned to You</Text>
          <Text style={[styles.queuePanelSub, { color: theme.colors.textMuted }]}>Live technician orders synced from admin approvals, assignment decisions, scheduling, and completion updates.</Text>
          {queue.length === 0 ? (
            <Text style={[styles.queueEmpty, { color: theme.colors.textMuted }]}>No technician orders are assigned to you right now.</Text>
          ) : (
            queue.slice(0, 3).map((entry) => (
              <View
                key={`${entry.queue_id}-${entry.order_number}`}
                style={[
                  styles.queueRow,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text style={[styles.queueTitle, { color: theme.colors.text }]}>{entry.order_number}</Text>
                <Text style={[styles.queueSub, { color: theme.colors.textMuted }]}>Status: {entry.order_status} | Priority: {(entry.priority || "standard").toUpperCase()}</Text>
                <Text style={[styles.queueSub, { color: theme.colors.textMuted }]}>Customer: {entry.customer_name || "N/A"} | Company: {entry.company_name || "N/A"}</Text>
                <Text style={[styles.queueSub, { color: theme.colors.textMuted }]}>Sample: {entry.sample_type || "N/A"} | Compound: {entry.compound_name || "N/A"}</Text>
                <Text style={[styles.queueSub, { color: theme.colors.textMuted }]}>Quantity: {entry.quantity ?? "N/A"} {entry.unit || ""} | Equipment: {entry.equipment_name || "Unassigned"}</Text>
                <Text style={[styles.queueSub, { color: theme.colors.textMuted }]}>Assigned Technician: {entry.assigned_technician_name || "Open technician pool"}</Text>
                <Text style={[styles.queueSub, { color: theme.colors.textMuted }]}>Start: {formatDateTime(entry.scheduled_start)} | ETA: {formatDateTime(entry.estimated_completion || entry.scheduled_end)}</Text>
                {entry.notes ? (
                  <Text style={[styles.queueNotes, { color: theme.colors.text }]}>Notes: {entry.notes}</Text>
                ) : null}
                {entry.technician_status_note ? (
                  <Text style={[styles.queueNotes, { color: theme.colors.primary }]}>Latest Update: {entry.technician_status_note}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>

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
            <Pressable onPress={() => router.push("/notifications")}>
              <Text style={[styles.notificationsLink, { color: theme.colors.primary }]}>Open All</Text>
            </Pressable>
          </View>
          {recentNotifications.length === 0 ? (
            <Text style={[styles.notificationsEmpty, { color: theme.colors.textMuted }]}>No recent technician notifications.</Text>
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
  updatedText: { fontSize: 12, fontWeight: "700" },
  featureCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  featureTitle: { fontSize: 16, fontWeight: "800" },
  featureDesc: { fontSize: 13, lineHeight: 19 },
  featureValue: { fontSize: 22, fontWeight: "800" },
  queuePanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  queuePanelTitle: { fontSize: 15, fontWeight: "800" },
  queuePanelSub: { fontSize: 12, lineHeight: 18 },
  queueEmpty: { fontSize: 12, fontWeight: "700" },
  queueRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  queueTitle: { fontSize: 14, fontWeight: "800" },
  queueSub: { fontSize: 12, lineHeight: 18 },
  queueNotes: { fontSize: 12, lineHeight: 18, fontWeight: "600" },
  actionBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
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
