import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { useCachedScreenState } from "../hooks/use-screen-cache";
import { fetchAdminOrderHistory, type AdminOrderHistoryDto } from "../lib/admin-api";
import {
    assignOrderEquipment,
    fetchTechnicianWorkQueue,
    type EquipmentRow,
    type QueueEntry,
} from "../lib/calendar-api";
import { formatBackendDateTime } from "../lib/date-time";
import { fetchEquipmentList } from "../lib/equipment-api";
import { normalizeOrderStatusForCompare } from "../lib/order-status-normalize";
import { toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

type EquipmentLinkedOrder = {
  queue_id: number;
  order_id: number;
  order_number: string;
  order_status?: string | null;
  sample_type?: string;
  sample_types: string[];
  compound_name?: string;
  scheduled_start?: string | null;
  estimated_completion?: string | null;
  equipment_id?: number | null;
  equipment_name?: string | null;
  customer_name?: string;
};

const formatText = (value?: string | null, fallback = "-") => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const formatSampleSummary = (entry: EquipmentLinkedOrder) => {
  const sample = entry.sample_type?.trim();
  const samples = entry.sample_types.filter(Boolean);
  if (sample) return sample;
  if (samples.length > 0) return samples.join(", ");
  return "-";
};

const formatSampleCompound = (entry: EquipmentLinkedOrder) => {
  const sample = formatSampleSummary(entry);
  const compound = entry.compound_name?.trim();
  return compound ? `Sample: ${sample} | Compound: ${compound}` : `Sample: ${sample}`;
};

const normalizeEquipmentRows = (rows: EquipmentRow[]) => {
  return rows.map((item, index) => ({
    id: typeof item.id === "number" ? item.id : -(index + 1),
    name: item.name || `Equipment ${index + 1}`,
    equipment_type: item.equipment_type || "",
    processing_time_per_sample: item.processing_time_per_sample ?? 0,
    warmup_time: item.warmup_time ?? 0,
    break_interval: item.break_interval ?? 0,
    break_duration: item.break_duration ?? 0,
    daily_capacity: item.daily_capacity ?? 0,
    is_available: item.is_available !== false,
    last_maintenance: item.last_maintenance ?? null,
  }));
};

const formatQuantity = (entry: QueueEntry) => {
  if (entry.quantity !== undefined && entry.quantity !== null) {
    return `Quantity: ${entry.quantity} ${entry.unit || ""}`.trim();
  }
  return "Quantity: -";
};

const formatOrderRef = (entry: EquipmentLinkedOrder) => {
  return `${entry.order_number} | ID ${entry.order_id}`;
};

const statusText = (value?: string | null) => {
  const normalized = normalizeOrderStatusForCompare(value);
  if (normalized === "completed") return "Completed";
  if (normalized === "processing") return "Processing";
  if (normalized === "approved") return "Approved";
  if (normalized === "payment_pending") return "Payment Pending";
  return "Submitted";
};

export default function TechnicianEquipmentPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const [entries, setEntries] = useCachedScreenState<QueueEntry[]>(
    "technician-equipment:entries:v3",
    [],
  );
  const [equipment, setEquipment] = useCachedScreenState<EquipmentRow[]>(
    "technician-equipment:equipment:v4",
    [],
  );
  const [historyRows, setHistoryRows] = useCachedScreenState<AdminOrderHistoryDto[]>(
    "technician-equipment:history:v4",
    [],
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "technician-equipment:lastUpdated:v4",
    "",
  );
  const [busyQueueId, setBusyQueueId] = useState<number | null>(null);
  const [equipmentTarget, setEquipmentTarget] = useState<QueueEntry | null>(null);
  const [expandedEquipmentId, setExpandedEquipmentId] = useState<number | null>(null);

  const loadLiveData = useCallback(async () => {
    try {
      const [data, liveEquipment, adminHistory] = await Promise.all([
        fetchTechnicianWorkQueue(),
        fetchEquipmentList().catch(() => []),
        fetchAdminOrderHistory().catch(() => []),
      ]);

      setEntries(data.queue ?? []);
      setEquipment(
        normalizeEquipmentRows(
          (liveEquipment.length > 0 ? liveEquipment : data.equipment ?? []) as EquipmentRow[],
        ),
      );
      setHistoryRows(adminHistory);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    }
  }, [setEntries, setEquipment, setHistoryRows, setLastUpdated]);

  useFocusedPolling(loadLiveData, { intervalMs: 12000 });

  const activeOrders = useMemo(
    () =>
      entries.filter((entry) => {
        const lifecycle = toLifecycleStatus(entry.order_status);
        return lifecycle !== "completed" && lifecycle !== "results_available";
      }),
    [entries],
  );

  const orderHistory = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const left = `${a.estimated_completion || a.scheduled_end || a.scheduled_start || ""}`;
        const right = `${b.estimated_completion || b.scheduled_end || b.scheduled_start || ""}`;
        return right.localeCompare(left);
      }),
    [entries],
  );

  const linkedOrders = useMemo(() => {
    const merged = new Map<string, EquipmentLinkedOrder>();

    entries.forEach((entry) => {
      if (!entry.equipment_id && !entry.equipment_name) return;
      const key = (entry.order_number || String(entry.order_id)).trim().toUpperCase();
      merged.set(key, {
        queue_id: entry.queue_id,
        order_id: entry.order_id,
        order_number: entry.order_number,
        order_status: entry.order_status,
        sample_type: entry.sample_type,
        sample_types: entry.sample_types || [],
        compound_name: entry.compound_name,
        scheduled_start: entry.scheduled_start,
        estimated_completion: entry.estimated_completion,
        equipment_id: entry.equipment_id,
        equipment_name: entry.equipment_name,
        customer_name: entry.customer_name,
      });
    });

    historyRows.forEach((row) => {
      if (!row.equipment_id && !row.equipment_name) return;
      const key = (row.order_number || String(row.id)).trim().toUpperCase();
      if (merged.has(key)) return;

      merged.set(key, {
        queue_id: row.id,
        order_id: row.id,
        order_number: row.order_number,
        order_status: row.status,
        sample_type: row.sample_type,
        sample_types: row.sample_type ? [row.sample_type] : [],
        compound_name: row.compound_name,
        scheduled_start: row.scheduled_start,
        estimated_completion: row.estimated_completion,
        equipment_id: row.equipment_id,
        equipment_name: row.equipment_name || null,
        customer_name: row.customer_name,
      });
    });

    return Array.from(merged.values());
  }, [entries, historyRows]);

  const utilization = useMemo(() => {
    return equipment.map((item) => {
      const bookings = linkedOrders.filter((entry) => {
        const byId = item.id > 0 && entry.equipment_id === item.id;
        const byName =
          (entry.equipment_name || "").trim().toLowerCase() ===
          item.name.trim().toLowerCase();
        return byId || byName;
      });

      return {
        ...item,
        bookings,
      };
    });
  }, [equipment, linkedOrders]);

  const stats = useMemo(() => {
    return {
      totalEquipment: equipment.length,
      totalBookings: utilization.reduce((sum, item) => sum + item.bookings.length, 0),
      bookedEquipment: utilization.filter((item) => item.bookings.length > 0).length,
      completedOrders: entries.filter(
        (entry) => normalizeOrderStatusForCompare(entry.order_status) === "completed",
      ).length,
    };
  }, [entries, equipment.length, utilization]);

  const assignEquipmentToOrder = async (
    entry: QueueEntry,
    selectedEquipment: Pick<EquipmentRow, "id" | "name"> | null,
  ) => {
    setBusyQueueId(entry.queue_id);
    try {
      await assignOrderEquipment(
        {
          orderId: entry.order_id,
          orderNumber: entry.order_number,
          firebaseKey: entry.firebase_key,
          status: entry.order_status,
          queueId: entry.queue_id,
          scheduledStart: entry.scheduled_start,
          scheduledEnd: entry.scheduled_end || entry.estimated_completion,
        },
        selectedEquipment,
      );
      await loadLiveData();
      setEquipmentTarget(null);
      feedback.showSuccess(
        selectedEquipment ? "Equipment Assigned" : "Equipment Cleared",
        selectedEquipment
          ? `${entry.order_number} is now booked on ${selectedEquipment.name}.`
          : `${entry.order_number} no longer has an equipment booking.`,
      );
    } catch (error) {
      feedback.showError(
        "Update Failed",
        error instanceof Error ? error.message : "Unable to update equipment booking.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  return (
    <RoleContentPage
      title="Equipment & Order History"
      subtitle="Assign equipment, check live bookings, and review technician order history."
      role="Technician"
      activeKey="equipment"
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
            <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>
              Updated {lastUpdated || "--"}
            </Text>
            <Pressable
              onPress={loadLiveData}
              style={[styles.refreshBtn, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.stat, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Total Equipment</Text>
              <Text style={[styles.statValue, { color: theme.colors.primary }]}>{stats.totalEquipment}</Text>
            </View>
            <View style={[styles.stat, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Total Bookings</Text>
              <Text style={[styles.statValue, { color: theme.colors.warning }]}>{stats.totalBookings}</Text>
            </View>
            <View style={[styles.stat, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Completed</Text>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>{stats.completedOrders}</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Assign Equipment to Orders</Text>
          {activeOrders.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No active technician orders right now.</Text>
          ) : (
            activeOrders.map((entry) => (
              <View
                key={`assign-${entry.queue_id}`}
                style={[
                  styles.orderCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.orderTitle, { color: theme.colors.text }]}>{entry.order_number}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>Status: {statusText(entry.order_status)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>{formatSampleCompound(entry)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>{formatQuantity(entry)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>Current Equipment: {formatText(entry.equipment_name, "Unassigned")}</Text>
                <Pressable
                  onPress={() => setEquipmentTarget(entry)}
                  disabled={busyQueueId === entry.queue_id}
                  style={[
                    styles.assignBtn,
                    {
                      backgroundColor: theme.colors.secondary,
                      opacity: busyQueueId === entry.queue_id ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={styles.assignBtnText}>
                    {entry.equipment_name ? "Change Equipment" : "Assign Equipment"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Live Equipment From Admin Panel</Text>
          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>Each equipment name below comes from the admin panel and shows how many orders are currently linked to it. Tap to open the order list.</Text>
          {utilization.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No equipment records available.</Text>
          ) : (
            utilization.map((item) => {
              const expanded = expandedEquipmentId === item.id;
              return (
                <View
                  key={`util-${item.id}`}
                  style={[
                    styles.utilCard,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => setExpandedEquipmentId(expanded ? null : item.id)}
                    style={styles.utilHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.utilName, { color: theme.colors.text }]}>{item.name}</Text>
                      <Text style={[styles.utilMeta, { color: theme.colors.textMuted }]}>
                        {item.equipment_type || "Equipment"} • {item.is_available ? "Available" : "Busy"}
                      </Text>
                      <Text style={[styles.utilOrdersLabel, { color: theme.colors.primary }]}>
                        Taken in for {item.bookings.length} order{item.bookings.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <View style={styles.utilRight}>
                      <Text style={[styles.utilCount, { color: theme.colors.primary }]}>
                        {expanded ? "Hide Orders" : "Show Orders"}
                      </Text>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={theme.colors.textMuted}
                      />
                    </View>
                  </Pressable>

                  {expanded ? (
                    item.bookings.length === 0 ? (
                      <Text style={[styles.bookingText, { color: theme.colors.textMuted }]}>No orders booked on this equipment.</Text>
                    ) : (
                      item.bookings.map((booking) => (
                        <View key={`${item.id}-${booking.queue_id}`} style={styles.bookingRow}>
                          <Text style={[styles.bookingText, { color: theme.colors.text }]}>
                            {formatOrderRef(booking)}
                          </Text>
                          <Text style={[styles.bookingMeta, { color: theme.colors.textMuted }]}>
                            Status: {statusText(booking.order_status)}
                            {booking.customer_name ? ` • ${booking.customer_name}` : ""}
                          </Text>
                          <Text style={[styles.bookingMeta, { color: theme.colors.textMuted }]}>
                            {formatSampleCompound(booking)}
                          </Text>
                        </View>
                      ))
                    )
                  ) : null}
                </View>
              );
            })
          )}

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Order History</Text>
          {orderHistory.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No technician order history available yet.</Text>
          ) : (
            orderHistory.map((entry) => (
              <View
                key={`history-${entry.queue_id}`}
                style={[
                  styles.historyCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.orderTitle, { color: theme.colors.text }]}>{entry.order_number}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>Status: {statusText(entry.order_status)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>Customer: {formatText(entry.customer_name)} | Company: {formatText(entry.company_name)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>{formatSampleCompound(entry)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>{formatQuantity(entry)}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>Equipment: {formatText(entry.equipment_name, "Unassigned")}</Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>ETA: {formatBackendDateTime(entry.estimated_completion || entry.scheduled_end, "Pending")}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(equipmentTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setEquipmentTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Assign Equipment</Text>
            <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}>
              {equipmentTarget?.order_number} will use the selected equipment.
            </Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {equipment.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No equipment records available.</Text>
              ) : (
                equipment.map((item) => {
                  const selected =
                    equipmentTarget?.equipment_id === item.id ||
                    equipmentTarget?.equipment_name === item.name;
                  return (
                    <Pressable
                      key={`pick-${item.id}`}
                      disabled={busyQueueId === equipmentTarget?.queue_id}
                      onPress={() => {
                        if (!equipmentTarget) return;
                        void assignEquipmentToOrder(equipmentTarget, item);
                      }}
                      style={[
                        styles.modalOption,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceMuted,
                          opacity: busyQueueId === equipmentTarget?.queue_id ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.modalOptionTitle, { color: theme.colors.text }]}>{item.name}</Text>
                      <Text style={[styles.modalOptionSub, { color: theme.colors.textMuted }]}>
                        {item.equipment_type || "Equipment"} | {item.is_available ? "Available" : "Busy"}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEquipmentTarget(null)}
                style={[
                  styles.modalSecondaryBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!equipmentTarget) return;
                  void assignEquipmentToOrder(equipmentTarget, null);
                }}
                disabled={!equipmentTarget || busyQueueId === equipmentTarget.queue_id}
                style={[
                  styles.modalPrimaryBtn,
                  {
                    backgroundColor: theme.colors.danger,
                    opacity:
                      !equipmentTarget || busyQueueId === equipmentTarget.queue_id ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={styles.modalPrimaryText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  updatedText: { fontSize: 12, fontWeight: "700" },
  refreshBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10 },
  statLabel: { fontSize: 11, fontWeight: "700" },
  statValue: { marginTop: 4, fontSize: 20, fontWeight: "800" },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  sectionSub: { fontSize: 12, lineHeight: 18 },
  empty: { fontSize: 12, fontWeight: "700" },
  orderCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  historyCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  orderTitle: { fontSize: 14, fontWeight: "800" },
  orderSub: { fontSize: 12 },
  assignBtn: { alignItems: "center", borderRadius: 10, paddingVertical: 9, marginTop: 4 },
  assignBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  utilCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  utilHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  utilRight: { alignItems: "flex-end", gap: 4 },
  utilName: { fontSize: 14, fontWeight: "800" },
  utilMeta: { fontSize: 12 },
  utilOrdersLabel: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  utilCount: { fontSize: 12, fontWeight: "800" },
  bookingRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D1D5DB", paddingTop: 8, gap: 2 },
  bookingText: { fontSize: 12, fontWeight: "700" },
  bookingMeta: { fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 14, maxHeight: "82%", gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "800" },
  modalSub: { fontSize: 12, lineHeight: 18 },
  modalList: { maxHeight: 320 },
  modalListContent: { gap: 8, paddingVertical: 2 },
  modalOption: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 3 },
  modalOptionTitle: { fontSize: 13, fontWeight: "800" },
  modalOptionSub: { fontSize: 12 },
  modalActions: { flexDirection: "row", gap: 8 },
  modalSecondaryBtn: { flex: 1, borderWidth: 1, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  modalPrimaryBtn: { flex: 1, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  modalSecondaryText: { fontSize: 12, fontWeight: "800" },
  modalPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
