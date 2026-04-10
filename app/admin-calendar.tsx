import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    fetchCalendarData,
    type EquipmentRow,
    type QueueEntry,
} from "../lib/calendar-api";
import { useAppTheme } from "../lib/theme";

type StatusFilter = "all" | "pending" | "processing" | "completed";

const normalizeStatus = (value?: string): Exclude<StatusFilter, "all"> => {
  const s = (value || "").toLowerCase();
  if (s.includes("complete") || s.includes("result")) return "completed";
  if (s.includes("queue") || s.includes("pending") || s.includes("submitted"))
    return "pending";
  return "processing";
};

export default function AdminCalendarPage() {
  const theme = useAppTheme();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>(
    new Date().toLocaleTimeString(),
  );
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [draftStatus, setDraftStatus] = useState<StatusFilter>("all");
  const [statusOpen, setStatusOpen] = useState(false);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCalendarData();
      setQueue(result.queue ?? []);
      setEquipment(result.equipment ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setQueue([]);
      setEquipment([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusedPolling(loadCalendar, { intervalMs: 18000 });

  const statusCounts = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;

    queue.forEach((item) => {
      const s = (item.order_status || "").toLowerCase();
      if (s.includes("complete") || s.includes("result")) {
        completed += 1;
      } else if (
        s.includes("queue") ||
        s.includes("pending") ||
        s.includes("submitted")
      ) {
        pending += 1;
      } else {
        inProgress += 1;
      }
    });

    return { pending, inProgress, completed };
  }, [queue]);

  const utilization = useMemo(() => {
    return equipment.map((eq) => {
      const count = queue.filter(
        (item) => (item.equipment_name || "") === eq.name,
      ).length;
      return { name: eq.name, count };
    });
  }, [equipment, queue]);

  const filteredQueue = useMemo(() => {
    if (statusFilter === "all") return queue;
    return queue.filter(
      (item) => normalizeStatus(item.order_status) === statusFilter,
    );
  }, [queue, statusFilter]);

  const actionGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];

  return (
    <RoleContentPage
      title="Calendar & Queue"
      subtitle="Scheduled orders, equipment utilization, and queue management."
      role="Admin"
      activeKey="calendar"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
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
            Updated {lastUpdated}
          </Text>
          <GradientButton
            style={styles.refreshBtn}
            onPress={loadCalendar}
            colors={actionGradient}
            compact
          >
            <Text style={styles.refreshText}>
              {loading ? "Refreshing..." : "Refresh"}
            </Text>
          </GradientButton>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Queue / Timeline
        </Text>
        <View style={styles.statRow}>
          <View
            style={[
              styles.chip,
              { backgroundColor: theme.colors.surfaceMuted },
            ]}
          >
            <Text style={[styles.chipText, { color: theme.colors.text }]}>
              Pending {statusCounts.pending}
            </Text>
          </View>
          <View
            style={[styles.chip, { backgroundColor: theme.colors.info + "22" }]}
          >
            <Text style={[styles.chipText, { color: theme.colors.info }]}>
              In progress {statusCounts.inProgress}
            </Text>
          </View>
          <View
            style={[
              styles.chip,
              { backgroundColor: theme.colors.success + "22" },
            ]}
          >
            <Text style={[styles.chipText, { color: theme.colors.success }]}>
              Completed {statusCounts.completed}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Total Queue
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.primary }]}
            >
              {queue.length}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Equipment In Use
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.warning }]}
            >
              {equipment.filter((eq) => !eq.is_available).length}
            </Text>
          </View>
        </View>

        <View style={styles.filterWrap}>
          <Pressable
            onPress={() => setStatusOpen((v) => !v)}
            style={[
              styles.filterBtn,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.filterBtnText, { color: theme.colors.text }]}>
              Status: {draftStatus.toUpperCase()}
            </Text>
            <Ionicons
              name={statusOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={theme.colors.textMuted}
            />
          </Pressable>
          {statusOpen ? (
            <View
              style={[
                styles.dropdown,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              {(
                ["all", "pending", "processing", "completed"] as StatusFilter[]
              ).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setDraftStatus(value);
                    setStatusOpen(false);
                  }}
                  style={[
                    styles.dropdownItem,
                    {
                      backgroundColor:
                        draftStatus === value
                          ? theme.colors.primarySoft
                          : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[styles.dropdownText, { color: theme.colors.text }]}
                  >
                    {value.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <GradientButton
          onPress={() => {
            setStatusFilter(draftStatus);
            setStatusOpen(false);
          }}
          style={styles.applyBtn}
          colors={actionGradient}
          compact
        >
          <Text style={styles.applyBtnText}>Filter</Text>
        </GradientButton>

        {filteredQueue.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            No scheduled orders.
          </Text>
        ) : (
          filteredQueue.slice(0, 8).map((item) => (
            <View
              key={item.queue_id}
              style={[
                styles.row,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                {item.order_number}
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                Status: {item.order_status} | Position: {item.position}
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                Equipment: {item.equipment_name || "Unassigned"}
              </Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Equipment utilization
        </Text>
        {utilization.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            No bookings
          </Text>
        ) : (
          utilization.map((item) => (
            <View
              key={item.name}
              style={[
                styles.utilCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.utilName, { color: theme.colors.text }]}>
                {item.name}
              </Text>
              <View
                style={[
                  styles.noBookingBox,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text
                  style={[styles.utilValue, { color: theme.colors.textMuted }]}
                >
                  {item.count === 0 ? "No bookings" : `${item.count} bookings`}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  updatedText: { fontSize: 13, fontWeight: "700" },
  refreshBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  statRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: "800" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: { fontSize: 20, fontWeight: "800", marginTop: 3 },
  filterWrap: { zIndex: 3 },
  filterBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterBtnText: { fontSize: 12, fontWeight: "700" },
  dropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: { paddingHorizontal: 10, paddingVertical: 8 },
  dropdownText: { fontSize: 12, fontWeight: "700" },
  applyBtn: { borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { fontSize: 13, fontWeight: "700" },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: "800" },
  rowSub: { fontSize: 12 },
  utilCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 10 },
  utilName: { fontSize: 13, fontWeight: "800" },
  noBookingBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  utilValue: { fontSize: 12, fontWeight: "700" },
});
