import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import {
    completeQueueOrder,
    fetchTechnicianWorkQueue,
    rescheduleQueue,
    startQueueProcessing,
    type EquipmentRow,
    type QueueEntry,
} from "../lib/calendar-api";
import { toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

type StatusFilter = "all" | "pending" | "processing" | "completed";

const normalizeStatus = (value?: string): Exclude<StatusFilter, "all"> => {
  const s = (value || "").toLowerCase();
  if (s.includes("complete") || s.includes("result")) return "completed";
  if (s.includes("pending") || s.includes("queue") || s.includes("submitted"))
    return "pending";
  return "processing";
};

const technicianOrderSummary = (value?: string) => {
  const lifecycle = toLifecycleStatus(value);
  if (lifecycle === "completed" || lifecycle === "results_available") {
    return "Admin accepted this order and technician processing is completed.";
  }
  if (lifecycle === "testing" || lifecycle === "preparation") {
    return "Admin accepted this order and it is currently in technician processing.";
  }
  if (lifecycle === "approved" || lifecycle === "in_queue") {
    return "Admin accepted this order and moved it into technician queue.";
  }
  return "This order is in pending transition state for technician actions.";
};

export default function TechnicianCalendarPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [busyQueueId, setBusyQueueId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [draftStatus, setDraftStatus] = useState<StatusFilter>("all");
  const [statusOpen, setStatusOpen] = useState(false);

  const loadCalendar = useCallback(async () => {
    try {
      const data = await fetchTechnicianWorkQueue();
      setEntries(data.queue ?? []);
      setEquipment(data.equipment ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setEntries([]);
      setEquipment([]);
    }
  }, []);

  useEffect(() => {
    loadCalendar();
    const timer = setInterval(loadCalendar, 8000);
    return () => clearInterval(timer);
  }, [loadCalendar]);

  useFocusEffect(
    useCallback(() => {
      loadCalendar();
    }, [loadCalendar]),
  );

  const statusCounts = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;

    entries.forEach((item) => {
      const status = (item.order_status || "").toLowerCase();
      if (status.includes("complete") || status.includes("result")) {
        completed += 1;
      } else if (
        status.includes("pending") ||
        status.includes("queue") ||
        status.includes("submitted")
      ) {
        pending += 1;
      } else {
        inProgress += 1;
      }
    });

    return { pending, inProgress, completed };
  }, [entries]);

  const utilization = useMemo(() => {
    return equipment.map((eq) => {
      const count = entries.filter(
        (entry) => (entry.equipment_name || "") === eq.name,
      ).length;
      return { name: eq.name, count };
    });
  }, [entries, equipment]);

  const filteredEntries = useMemo(() => {
    if (statusFilter === "all") return entries;
    return entries.filter(
      (entry) => normalizeStatus(entry.order_status) === statusFilter,
    );
  }, [entries, statusFilter]);

  const markChecked = async (entry: QueueEntry) => {
    setBusyQueueId(entry.queue_id);
    try {
      await completeQueueOrder({
        orderId: entry.order_id,
        orderNumber: entry.order_number,
        queueId: entry.queue_id,
      });
      await loadCalendar();
      feedback.showSuccess(
        "Queue Updated",
        `${entry.order_number} marked as completed.`,
      );
    } catch (error) {
      feedback.showError(
        "Update Failed",
        error instanceof Error
          ? error.message
          : "Unable to update queue entry.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  const logDelay = async (entry: QueueEntry) => {
    setBusyQueueId(entry.queue_id);
    try {
      const start = entry.scheduled_start
        ? new Date(entry.scheduled_start)
        : new Date();
      const endBase = entry.scheduled_end
        ? new Date(entry.scheduled_end)
        : new Date(start.getTime() + 30 * 60 * 1000);
      const delayedStart = new Date(
        start.getTime() + 15 * 60 * 1000,
      ).toISOString();
      const delayedEnd = new Date(
        endBase.getTime() + 15 * 60 * 1000,
      ).toISOString();
      await rescheduleQueue(
        entry.queue_id,
        delayedStart,
        delayedEnd,
        "Technician logged delay via mobile app",
      );
      await loadCalendar();
      feedback.showSuccess(
        "Delay Logged",
        `${entry.order_number} was delayed by 15 minutes.`,
      );
    } catch (error) {
      feedback.showError(
        "Delay Failed",
        error instanceof Error ? error.message : "Unable to log delay.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  const startProcessing = async (entry: QueueEntry) => {
    setBusyQueueId(entry.queue_id);
    try {
      await startQueueProcessing(
        entry.order_id,
        entry.queue_id,
        entry.order_number,
      );
      await loadCalendar();
      feedback.showSuccess(
        "Processing Started",
        `${entry.order_number} moved to processing. Customer will see the status update shortly.`,
      );
    } catch (error) {
      feedback.showError(
        "Start Processing Failed",
        error instanceof Error
          ? error.message
          : "Unable to set processing status.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  return (
    <RoleContentPage
      title="Calendar"
      subtitle="Calendar and queue management for active technician tasks."
      role="Technician"
      activeKey="calendar"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
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
            <Text
              style={[styles.updatedText, { color: theme.colors.textMuted }]}
            >
              Updated {lastUpdated || "--"}
            </Text>
            <Pressable
              style={[
                styles.refreshBtn,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={loadCalendar}
            >
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
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
              style={[
                styles.chip,
                { backgroundColor: theme.colors.info + "22" },
              ]}
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
                {entries.length}
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
                Busy Equipment
              </Text>
              <Text
                style={[styles.summaryValue, { color: theme.colors.warning }]}
              >
                {equipment.filter((eq) => !eq.is_available).length}
              </Text>
            </View>
          </View>

          <View style={styles.selectorWrap}>
            <Pressable
              onPress={() => setStatusOpen((v) => !v)}
              style={[
                styles.selectorBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <View style={styles.selectorInner}>
                <Text
                  style={[styles.selectorText, { color: theme.colors.text }]}
                >
                  Status: {draftStatus.toUpperCase()}
                </Text>
                <Ionicons
                  name={statusOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.colors.textMuted}
                />
              </View>
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
                  [
                    "all",
                    "pending",
                    "processing",
                    "completed",
                  ] as StatusFilter[]
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
                      style={[
                        styles.dropdownItemText,
                        { color: theme.colors.text },
                      ]}
                    >
                      {value.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              setStatusFilter(draftStatus);
              setStatusOpen(false);
            }}
            style={[
              styles.applyBtn,
              { backgroundColor: theme.colors.secondary },
            ]}
          >
            <Text style={styles.applyBtnText}>Filter</Text>
          </Pressable>

          {filteredEntries.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              No queue entries assigned.
            </Text>
          ) : (
            filteredEntries.slice(0, 10).map((entry) => (
              <View
                key={entry.queue_id}
                style={[
                  styles.row,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                {(() => {
                  const lifecycle = toLifecycleStatus(entry.order_status);
                  const rawStatus = (entry.order_status || "").toLowerCase();
                  const canStartProcessing =
                    lifecycle === "approved" ||
                    lifecycle === "in_queue" ||
                    lifecycle === "submitted";
                  const alreadyProcessing =
                    lifecycle === "testing" || lifecycle === "preparation";
                  const alreadyCompleted =
                    lifecycle === "results_available" ||
                    lifecycle === "completed" ||
                    rawStatus.includes("result") ||
                    rawStatus.includes("complete") ||
                    rawStatus.includes("done");

                  return (
                    <>
                      <Text
                        style={[styles.title, { color: theme.colors.text }]}
                      >
                        {entry.order_number}
                      </Text>
                      <Text
                        style={[styles.sub, { color: theme.colors.textMuted }]}
                      >
                        Status: {entry.order_status || "pending"} | Position:{" "}
                        {entry.position}
                      </Text>
                      <Text
                        style={[styles.subStrong, { color: theme.colors.info }]}
                      >
                        {technicianOrderSummary(entry.order_status)}
                      </Text>
                      <Text
                        style={[styles.sub, { color: theme.colors.textMuted }]}
                      >
                        Order ID: {entry.order_id} | Queue ID: {entry.queue_id}
                      </Text>
                      <Text
                        style={[styles.sub, { color: theme.colors.textMuted }]}
                      >
                        Equipment: {entry.equipment_name || "Unassigned"}
                      </Text>
                      <Text
                        style={[styles.sub, { color: theme.colors.textMuted }]}
                      >
                        Sample Types:{" "}
                        {entry.sample_types?.length
                          ? entry.sample_types.join(", ")
                          : "N/A"}
                      </Text>
                      <Text
                        style={[styles.sub, { color: theme.colors.textMuted }]}
                      >
                        Start: {entry.scheduled_start || "Not scheduled"} | End:{" "}
                        {entry.scheduled_end || "Pending"}
                      </Text>
                      <Text
                        style={[styles.sub, { color: theme.colors.textMuted }]}
                      >
                        Estimated Completion:{" "}
                        {entry.estimated_completion || "Pending"}
                      </Text>
                      {entry.queue_id < 0 ? (
                        <Text
                          style={[styles.sub, { color: theme.colors.warning }]}
                        >
                          Pending queue assignment. You can mark completion now;
                          delay control unlocks after scheduler confirms this
                          entry.
                        </Text>
                      ) : null}
                      <View style={styles.rowActions}>
                        <Pressable
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: theme.colors.info,
                              opacity:
                                busyQueueId === entry.queue_id ||
                                !canStartProcessing ||
                                alreadyCompleted
                                  ? 0.7
                                  : 1,
                            },
                          ]}
                          disabled={
                            busyQueueId === entry.queue_id ||
                            !canStartProcessing ||
                            alreadyCompleted
                          }
                          onPress={() =>
                            confirm.openConfirm({
                              title: "Start Processing",
                              message: `Set ${entry.order_number} to processing now?`,
                              confirmText: "Start",
                              onConfirm: () => startProcessing(entry),
                            })
                          }
                        >
                          <Text style={styles.actionBtnText}>
                            {alreadyCompleted
                              ? "Completed"
                              : alreadyProcessing
                                ? "In Progress"
                                : canStartProcessing
                                  ? "Start"
                                  : "Locked"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: theme.colors.success,
                              opacity: busyQueueId === entry.queue_id ? 0.7 : 1,
                            },
                          ]}
                          disabled={busyQueueId === entry.queue_id}
                          onPress={() =>
                            confirm.openConfirm({
                              title: "Mark As Checked",
                              message: `Mark ${entry.order_number} as checked/completed?`,
                              confirmText: "Mark Checked",
                              onConfirm: () => markChecked(entry),
                            })
                          }
                        >
                          <Text style={styles.actionBtnText}>Check</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: theme.colors.secondary,
                              opacity:
                                busyQueueId === entry.queue_id ||
                                entry.queue_id < 0
                                  ? 0.7
                                  : 1,
                            },
                          ]}
                          disabled={
                            busyQueueId === entry.queue_id || entry.queue_id < 0
                          }
                          onPress={() =>
                            confirm.openConfirm({
                              title: "Log Delay",
                              message: `Log a 15-minute delay for ${entry.order_number}?`,
                              confirmText: "Log Delay",
                              onConfirm: () => logDelay(entry),
                            })
                          }
                        >
                          <Text style={styles.actionBtnText}>
                            {entry.queue_id < 0 ? "Awaiting Slot" : "Delay"}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  );
                })()}
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Equipment Utilization
          </Text>
          {utilization.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              No equipment entries available.
            </Text>
          ) : (
            utilization.map((item) => (
              <View
                key={item.name}
                style={[
                  styles.utilRow,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.utilName, { color: theme.colors.text }]}>
                  {item.name}
                </Text>
                <Text
                  style={[styles.utilCount, { color: theme.colors.primary }]}
                >
                  {item.count === 0 ? "No bookings" : `${item.count} bookings`}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      {feedback.modal}
      {confirm.modal}
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
  updatedText: { fontSize: 12, fontWeight: "700" },
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
  selectorWrap: { zIndex: 3 },
  selectorBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  selectorInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorText: { fontSize: 12, fontWeight: "700" },
  dropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: { paddingHorizontal: 10, paddingVertical: 8 },
  dropdownItemText: { fontSize: 12, fontWeight: "700" },
  applyBtn: { borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  applyBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  empty: { fontSize: 12, fontWeight: "700" },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  title: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12 },
  subStrong: { fontSize: 12, fontWeight: "700" },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  actionBtn: {
    flex: 1,
    minWidth: 92,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  utilRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  utilName: { fontSize: 13, fontWeight: "700" },
  utilCount: { fontSize: 13, fontWeight: "800" },
});
