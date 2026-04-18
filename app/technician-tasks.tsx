import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import {
    approveOrder,
    fetchAdminOrderHistory,
    fetchPendingOrders,
    rejectOrder,
    type PendingOrderDto,
} from "../lib/admin-api";
import {
    fetchTechnicianWorkQueue,
    startQueueProcessing,
    type QueueEntry,
} from "../lib/calendar-api";
import { backendDateTimeValue, formatBackendDateTime } from "../lib/date-time";
import { normalizeOrderPriorityValue, toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

const formatDate = (value?: string | null) =>
  formatBackendDateTime(value, "--");

const hasMeaningfulText = (value?: string | null) => {
  const trimmed = (value || "").trim();
  return Boolean(
    trimmed &&
      !/^(?:-|_|customer|customer name|company|not provided|unknown)$/i.test(
        trimmed,
      ),
  );
};

const resolveText = (
  values: (string | null | undefined)[],
  fallback = "Not available",
) => {
  for (const value of values) {
    if (hasMeaningfulText(value)) {
      return value!.trim();
    }
  }
  return fallback;
};

const formatDisplayCase = (
  value?: string | null,
  fallback = "Not available",
) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatQuantity = (item: QueueEntry, detail?: PendingOrderDto) => {
  const quantity = detail?.quantity ?? item.quantity;
  const unit = detail?.unit ?? item.unit;

  if (typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0) {
    return `${quantity} ${unit || ""}`.trim();
  }

  if (typeof detail?.sample_count === "number" && detail.sample_count > 0) {
    return `${detail.sample_count} sample(s)`;
  }

  return "Not available";
};

const isPendingTechnicianApproval = (item: QueueEntry) => {
  const lifecycle = toLifecycleStatus(item.order_status);
  return lifecycle === "payment_pending";
};

const dedupeQueue = (entries: QueueEntry[]) => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = (entry.order_number || `${entry.order_id || entry.queue_id}`)
      .trim()
      .toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

type ApprovalCard = {
  item: QueueEntry;
  detail?: PendingOrderDto;
};

type TechnicianPendingSort = "newest" | "oldest" | "priority_high" | "priority_standard";

const sortPendingOrdersList = (
  rows: PendingOrderDto[],
  mode: TechnicianPendingSort,
): PendingOrderDto[] => {
  const next = [...rows];
  next.sort((a, b) => {
    if (mode === "priority_high") {
      const ah = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
      const bh = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
      if (ah !== bh) return bh - ah;
    } else if (mode === "priority_standard") {
      const ah = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
      const bh = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
      if (ah !== bh) return ah - bh;
    }
    const at = backendDateTimeValue(a.created_at);
    const bt = backendDateTimeValue(b.created_at);
    if (mode === "oldest") return at - bt;
    return bt - at;
  });
  return next;
};

const sortQueuePendingItems = (
  items: QueueEntry[],
  mode: TechnicianPendingSort,
): QueueEntry[] => {
  const next = [...items];
  const time = (q: QueueEntry) =>
    backendDateTimeValue(q.assigned_at || q.scheduled_start);
  next.sort((a, b) => {
    if (mode === "priority_high") {
      const ah = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
      const bh = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
      if (ah !== bh) return bh - ah;
    } else if (mode === "priority_standard") {
      const ah = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
      const bh = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
      if (ah !== bh) return ah - bh;
    }
    const at = time(a);
    const bt = time(b);
    if (mode === "oldest") {
      if (at !== bt) return at - bt;
      return a.position - b.position;
    }
    if (bt !== at) return bt - at;
    return a.position - b.position;
  });
  return next;
};

const SHARED_PENDING_COUNT_KEY = "technician:pendingCount:v1";
const SHARED_QUEUE_COUNT_KEY = "technician:queueCount:v1";
const SHARED_UPDATED_KEY = "technician:lastUpdated:v1";

const toApprovalQueueEntry = (detail: PendingOrderDto): QueueEntry => ({
  queue_id: -(detail.id || 1),
  firebase_key: detail.firebase_key,
  order_id: detail.id,
  order_number: detail.order_number,
  order_status: detail.status || "submitted",
  priority: normalizeOrderPriorityValue(detail.priority),
  customer_name: detail.customer_name,
  company_name: detail.company_name,
  sample_type: detail.sample_type,
  compound_name: detail.compound_name,
  quantity: detail.quantity,
  unit: detail.unit,
  notes: detail.notes,
  assigned_at: detail.assigned_at || detail.created_at,
  assigned_technician_uid: detail.assigned_technician_uid,
  assigned_technician_name: detail.assigned_technician_name,
  assigned_technician_email: detail.assigned_technician_email,
  technician_status_action: detail.technician_status_action,
  technician_status_note: detail.technician_status_note,
  technician_status_updated_at: detail.technician_status_updated_at,
  technician_status_updated_by: detail.technician_status_updated_by,
  sample_types: detail.sample_type ? [detail.sample_type] : [],
  equipment_id: detail.equipment_id ?? null,
  equipment_name: detail.equipment_name ?? null,
  scheduled_start: detail.scheduled_start ?? null,
  scheduled_end: detail.scheduled_end ?? null,
  estimated_completion: detail.estimated_completion ?? null,
  position: 0,
  queue_type: "pending_approval",
});

export default function TechnicianTasksPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();
  const [queue, setQueue] = useCachedScreenState<QueueEntry[]>(
    "technician-tasks:queue:v7",
    [],
  );
  const [details, setDetails] = useCachedScreenState<PendingOrderDto[]>(
    "technician-tasks:details:v9",
    [],
  );
  const [pendingOrders, setPendingOrders] = useCachedScreenState<PendingOrderDto[]>(
    "technician-tasks:pendingOrders:v10",
    [],
  );
  const [, setWebsitePendingCount] = useCachedScreenState(
    SHARED_PENDING_COUNT_KEY,
    0,
  );
  const [websiteQueueCount, setWebsiteQueueCount] = useCachedScreenState(
    SHARED_QUEUE_COUNT_KEY,
    0,
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("technician-tasks:queue:v7"),
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    SHARED_UPDATED_KEY,
    "",
  );
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<TechnicianPendingSort>("newest");

  const loadTasks = useCallback(async () => {
    if (queue.length === 0) {
      setLoading(true);
    }

    try {
      const [queueData, pendingData, historyData] = await Promise.all([
        fetchTechnicianWorkQueue(),
        fetchPendingOrders().catch(() => [] as PendingOrderDto[]),
        fetchAdminOrderHistory().catch(() => [] as PendingOrderDto[]),
      ]);

      const mergedDetails = [...pendingData, ...historyData];

      setQueue(dedupeQueue(queueData.queue ?? []));
      setPendingOrders(pendingData);
      setDetails(mergedDetails);
      const uniqueQueue = dedupeQueue(queueData.queue ?? []);
      const pendingQueue = uniqueQueue.filter((item) => isPendingTechnicianApproval(item));
      const livePendingCount =
        typeof queueData.dashboardPendingCount === "number" && queueData.dashboardPendingCount > 0
          ? queueData.dashboardPendingCount
          : undefined;

      setWebsitePendingCount(
        pendingData.length > 0
          ? pendingData.length
          : (livePendingCount ?? pendingQueue.length),
      );
      setWebsiteQueueCount(
        typeof queueData.dashboardQueueCount === "number" && queueData.dashboardQueueCount > 0
          ? queueData.dashboardQueueCount
          : uniqueQueue.length,
      );
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
    }
  }, [queue.length, setDetails, setLastUpdated, setPendingOrders, setQueue, setWebsitePendingCount, setWebsiteQueueCount]);

  useFocusedPolling(loadTasks, { intervalMs: 12000 });

  const detailByOrder = useMemo(() => {
    const byOrder = new Map<string, PendingOrderDto>();
    details.forEach((detail) => {
      const key = (detail.order_number || "").trim().toLowerCase();
      if (key && !byOrder.has(key)) {
        byOrder.set(key, detail);
      }
    });
    return byOrder;
  }, [details]);

  const pendingApprovals = useMemo<ApprovalCard[]>(() => {
    const maxCards = 100;

    if (pendingOrders.length > 0) {
      const sorted = sortPendingOrdersList(pendingOrders, sortMode);
      return sorted.slice(0, maxCards).map((detail) => {
        const matchedItem =
          dedupeQueue(queue).find(
            (item) =>
              (item.order_number || "").trim().toLowerCase() ===
                (detail.order_number || "").trim().toLowerCase() ||
              item.order_id === detail.id,
          ) || toApprovalQueueEntry(detail);

        return { item: matchedItem, detail };
      });
    }

    const pendingQueue = sortQueuePendingItems(
      dedupeQueue(queue).filter((item) => isPendingTechnicianApproval(item)),
      sortMode,
    );

    return pendingQueue.slice(0, maxCards).map((item) => ({
      item,
      detail:
        detailByOrder.get((item.order_number || "").trim().toLowerCase()) ||
        details.find((detail) => detail.id === item.order_id),
    }));
  }, [detailByOrder, details, pendingOrders, queue, sortMode]);

  const queuedCount = useMemo(
    () =>
      websiteQueueCount > 0
        ? websiteQueueCount
        : dedupeQueue(queue).filter((item) => {
            const lifecycle = toLifecycleStatus(item.order_status);
            return (
              lifecycle === "in_queue" ||
              lifecycle === "testing" ||
              lifecycle === "preparation"
            );
          }).length,
    [queue, websiteQueueCount],
  );

  const handleApprove = async (card: ApprovalCard) => {
    const { item, detail } = card;
    setBusyOrderId(item.order_id);

    try {
      try {
        await startQueueProcessing(item.order_id, item.queue_id, item.order_number, {
          note: "Technician approved this order for laboratory processing.",
        });
      } catch (error) {
        if (detail) {
          await approveOrder(detail);
        } else {
          throw error;
        }
      }

      await loadTasks();
      feedback.showSuccess(
        "Order Approved",
        `${item.order_number} moved forward in the technician workflow.`,
      );
      router.push("/technician-calendar");
    } catch (error) {
      feedback.showError(
        "Approval Failed",
        error instanceof Error ? error.message : "Unable to approve this order.",
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleReject = async (card: ApprovalCard) => {
    const { item, detail } = card;
    setBusyOrderId(item.order_id);

    try {
      await rejectOrder(
        detail || {
          id: item.order_id,
          firebase_key: item.firebase_key,
          order_number: item.order_number,
          customer_name: resolveText([item.customer_name], "Customer"),
          created_at:
            item.assigned_at || item.scheduled_start || new Date().toISOString(),
          priority: normalizeOrderPriorityValue(item.priority),
          sample_count: item.sample_types?.length || 0,
        },
        "Rejected by technician after review.",
      );

      await loadTasks();
      feedback.showSuccess(
        "Order Rejected",
        `${item.order_number} was rejected successfully.`,
      );
    } catch (error) {
      feedback.showError(
        "Rejection Failed",
        error instanceof Error ? error.message : "Unable to reject this order.",
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <RoleContentPage
      title="Pending Approvals"
      subtitle=""
      role="Technician"
      activeKey="approvals"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
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
          <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>Updated {lastUpdated || (loading ? "Loading..." : "--")}</Text>
          <Pressable
            onPress={loadTasks}
            style={[styles.refreshBtn, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={styles.refreshBtnText}>{loading ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
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
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Pending</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>{pendingApprovals.length}</Text>
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
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>In Queue</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.secondary }]}>{queuedCount}</Text>
          </View>
        </View>

        <View style={styles.sortRow}>
          {(
            [
              ["newest", "Newest"],
              ["oldest", "Oldest"],
              ["priority_high", "High first"],
              ["priority_standard", "Standard first"],
            ] as const
          ).map(([value, label]) => {
            const active = sortMode === value;
            return (
              <Pressable
                key={value}
                onPress={() => setSortMode(value)}
                style={[
                  styles.sortChip,
                  {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    { color: active ? theme.colors.primary : theme.colors.textMuted },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {pendingApprovals.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No technician approvals are pending right now.</Text>
        ) : (
          pendingApprovals.map((card) => {
            const { item, detail } = card;
            const customerName = resolveText([detail?.customer_name, item.customer_name]);
            const companyName = resolveText([detail?.company_name, item.company_name]);
            const sampleType = formatDisplayCase(
              resolveText([
                detail?.sample_type,
                item.sample_type,
                item.sample_types?.join(", "),
              ]),
            );
            const compoundName = formatDisplayCase(detail?.compound_name, "Not available");
            const submittedAt = formatDate(
              detail?.created_at || item.assigned_at || item.scheduled_start,
            );
            const priorityLabel = resolveText([detail?.priority, item.priority], "standard");
            const priorityNorm = normalizeOrderPriorityValue(priorityLabel);
            const isHighPriority = priorityNorm === "high";
            const priorityTitle = isHighPriority ? "HIGH" : "STANDARD";

            return (
              <View
                key={`${item.queue_id}-${item.order_number}`}
                style={[
                  styles.orderCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <View style={styles.orderHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orderNumber, { color: theme.colors.text }]}>{item.order_number}</Text>
                    <Text style={[styles.orderStatus, { color: theme.colors.success }]}>Live technician approval • ready for review</Text>
                  </View>
                  <View
                    style={[
                      styles.priorityBadge,
                      {
                        backgroundColor: isHighPriority
                          ? theme.colors.warning + "22"
                          : theme.colors.border + "66",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityText,
                        {
                          color: isHighPriority
                            ? theme.colors.warning
                            : theme.colors.textMuted,
                        },
                      ]}
                    >
                      {priorityTitle}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Customer</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{customerName}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Company</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{companyName}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Sample Type</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{sampleType}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Compound</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{compoundName}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Quantity</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{formatQuantity(item, detail)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Submitted</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{submittedAt}</Text>
                  </View>
                </View>

                {detail?.notes ? (
                  <Text style={[styles.equipmentText, { color: theme.colors.textMuted }]}>Notes: {detail.notes}</Text>
                ) : null}

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() =>
                      confirm.openConfirm({
                        title: "Approve Order",
                        message: `Approve ${item.order_number} for technician processing?`,
                        confirmText: "Approve",
                        onConfirm: () => handleApprove(card),
                      })
                    }
                    disabled={busyOrderId === item.order_id}
                    style={[
                      styles.primaryBtn,
                      {
                        backgroundColor:
                          busyOrderId === item.order_id ? theme.colors.border : theme.colors.primary,
                      },
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>{busyOrderId === item.order_id ? "Working..." : "Approve"}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      confirm.openConfirm({
                        title: "Reject Order",
                        message: `Reject ${item.order_number}?`,
                        confirmText: "Reject",
                        onConfirm: () => handleReject(card),
                      })
                    }
                    disabled={busyOrderId === item.order_id}
                    style={[
                      styles.rejectBtn,
                      {
                        backgroundColor:
                          busyOrderId === item.order_id ? theme.colors.border : theme.colors.danger,
                      },
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
      {feedback.modal}
      {confirm.modal}
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
  refreshBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10 },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sortChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortChipText: { fontSize: 11, fontWeight: "800" },
  empty: { fontSize: 12, fontWeight: "700" },
  orderCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  orderNumber: { fontSize: 15, fontWeight: "800" },
  orderStatus: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  priorityBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  priorityText: { fontSize: 10, fontWeight: "800" },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailItem: { width: "47%", gap: 2 },
  detailLabel: { fontSize: 11, fontWeight: "700" },
  detailValue: { fontSize: 12, fontWeight: "700" },
  equipmentText: { fontSize: 12, fontWeight: "700" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  primaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  rejectBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
