import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { fetchTechnicianWorkQueue, type QueueEntry } from "../lib/calendar-api";
import { useAppTheme } from "../lib/theme";

export default function TechnicianDashboardPage() {
  const theme = useAppTheme();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTechnicianWorkQueue();
      setQueue(data.queue ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const cards = [
    {
      title: "Processing Queue",
      description: "View and manage the sample processing queue",
      value: `${taskStats.processingQueue} in Queue`,
      actionLabel: "View Queue",
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
  actionBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
