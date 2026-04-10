import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { statusLabel, toLifecycleStatus } from "../lib/order-workflow";
import {
    fetchCustomerMyOrders,
    type CustomerOrderRow,
} from "../lib/orders-api";
import { useAppTheme } from "../lib/theme";

type StatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "rejected";
type SortMode = "newest" | "oldest" | "priority";

const statusOptions: StatusFilter[] = [
  "all",
  "pending",
  "approved",
  "processing",
  "completed",
  "rejected",
];
const sortOptions: SortMode[] = ["newest", "oldest", "priority"];

const normalizeOrderStatus = (value?: string): StatusFilter => {
  const lifecycle = toLifecycleStatus(value);
  if (lifecycle === "completed" || lifecycle === "results_available") {
    return "completed";
  }
  if (lifecycle === "testing" || lifecycle === "preparation") {
    return "processing";
  }
  if (lifecycle === "approved" || lifecycle === "in_queue") {
    return "approved";
  }
  if (lifecycle === "rejected") {
    return "rejected";
  }
  return "pending";
};

const getTimelineStep = (status: StatusFilter) => {
  if (status === "pending") return 1;
  if (status === "approved") return 2;
  if (status === "processing") return 3;
  if (status === "completed") return 4;
  return 0;
};

const getProgressPercent = (status: StatusFilter) => {
  if (status === "pending") return 25;
  if (status === "approved") return 50;
  if (status === "processing") return 75;
  if (status === "completed") return 100;
  return 0;
};

const getStageMeaning = (status: StatusFilter) => {
  if (status === "pending") return "Submitted: waiting for admin review.";
  if (status === "approved") return "Approved: accepted and added to queue.";
  if (status === "processing") {
    return "Processing: technician is currently handling this order.";
  }
  if (status === "completed") return "Completed: results are ready.";
  return "Rejected: request was declined by admin.";
};

const getDecisionSummary = (status: StatusFilter, orderNumber: string) => {
  if (status === "rejected") {
    return `Admin Decision: Rejected - ${orderNumber} was not approved.`;
  }
  if (
    status === "approved" ||
    status === "processing" ||
    status === "completed"
  ) {
    return `Admin Decision: Accepted - ${orderNumber} passed admin review.`;
  }
  return `Admin Decision: Pending - ${orderNumber} is waiting for admin review.`;
};

export default function CustomerMyOrdersPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const previousStatusByIdRef = useRef<Record<string, StatusFilter>>({});
  const [orders, setOrders] = useState<CustomerOrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [draftStatus, setDraftStatus] = useState<StatusFilter>("all");
  const [draftSort, setDraftSort] = useState<SortMode>("newest");
  const [statusOpen, setStatusOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const loadData = useCallback(async () => {
    try {
      const rows = await fetchCustomerMyOrders();
      const previous = previousStatusByIdRef.current;
      const hasPreviousSnapshot = Object.keys(previous).length > 0;
      const nextSnapshot: Record<string, StatusFilter> = {};
      const movedToProcessing: string[] = [];
      const movedToCompleted: string[] = [];
      const movedToRejected: string[] = [];

      rows.forEach((row) => {
        const key = String(row.id);
        const nextStatus = normalizeOrderStatus(row.status);
        nextSnapshot[key] = nextStatus;

        if (!hasPreviousSnapshot) return;

        const previousStatus = previous[key];
        if (!previousStatus || previousStatus === nextStatus) return;

        const label = row.order_number || `Order #${row.id}`;
        if (nextStatus === "processing") movedToProcessing.push(label);
        if (nextStatus === "completed") movedToCompleted.push(label);
        if (nextStatus === "rejected") movedToRejected.push(label);
      });

      previousStatusByIdRef.current = nextSnapshot;
      setOrders(rows);
      setLastUpdated(new Date().toLocaleTimeString());

      if (movedToCompleted.length > 0) {
        const first = movedToCompleted[0];
        const remaining = movedToCompleted.length - 1;
        feedback.showSuccess(
          "Order Completed",
          remaining > 0
            ? `${first} and ${remaining} more order(s) are now completed.`
            : `${first} is now completed and results are ready.`,
        );
      } else if (movedToProcessing.length > 0) {
        const first = movedToProcessing[0];
        const remaining = movedToProcessing.length - 1;
        feedback.showInfo(
          "Order In Processing",
          remaining > 0
            ? `${first} and ${remaining} more order(s) moved to technician processing.`
            : `${first} moved to technician processing.`,
        );
      } else if (movedToRejected.length > 0) {
        const first = movedToRejected[0];
        const remaining = movedToRejected.length - 1;
        feedback.showError(
          "Order Disapproved",
          remaining > 0
            ? `${first} and ${remaining} more order(s) were disapproved by admin.`
            : `${first} was disapproved by admin.`,
        );
      }
    } catch {
      setOrders([]);
    }
  }, [feedback]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, [loadData]);

  const stats = useMemo(() => {
    const submitted = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "pending",
    ).length;
    const approved = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "approved",
    ).length;
    const completed = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "completed",
    ).length;
    const processing = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "processing",
    ).length;
    const rejected = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "rejected",
    ).length;
    return { submitted, approved, processing, completed, rejected };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalized = [...orders].filter((order) => {
      if (statusFilter === "all") return true;
      return normalizeOrderStatus(order.status) === statusFilter;
    });

    normalized.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

      if (sortMode === "newest") return bTime - aTime;
      if (sortMode === "oldest") return aTime - bTime;

      const aPriority =
        (a.priority || "standard").toLowerCase() === "priority" ? 1 : 0;
      const bPriority =
        (b.priority || "standard").toLowerCase() === "priority" ? 1 : 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      return bTime - aTime;
    });

    return normalized;
  }, [orders, sortMode, statusFilter]);

  return (
    <RoleContentPage
      title="My Orders"
      subtitle="Track where each order stands from submission to completion."
      role="Customer"
      activeKey="my-orders"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <ScrollView
        contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
        onScrollBeginDrag={() => {
          setStatusOpen(false);
          setSortOpen(false);
        }}
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
              styles.banner,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.bannerTitle, { color: theme.colors.text }]}>
              Order Stage Guide
            </Text>
            <Text style={[styles.bannerSub, { color: theme.colors.textMuted }]}>
              Submitted: waiting for admin review
            </Text>
            <Text style={[styles.bannerSub, { color: theme.colors.textMuted }]}>
              Approved: accepted and queued
            </Text>
            <Text style={[styles.bannerSub, { color: theme.colors.textMuted }]}>
              Processing: technician is working on it
            </Text>
            <Text style={[styles.bannerSub, { color: theme.colors.textMuted }]}>
              Completed: results are ready
            </Text>
          </View>

          <Text style={[styles.syncText, { color: theme.colors.textMuted }]}>
            Live Updated: {lastUpdated || "--"}
          </Text>

          <View style={styles.statsRow}>
            <View
              style={[
                styles.stat,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Submitted
              </Text>
              <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                {stats.submitted}
              </Text>
            </View>
            <View
              style={[
                styles.stat,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Approved
              </Text>
              <Text
                style={[styles.statValue, { color: theme.colors.secondary }]}
              >
                {stats.approved}
              </Text>
            </View>
            <View
              style={[
                styles.stat,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Processing
              </Text>
              <Text style={[styles.statValue, { color: theme.colors.warning }]}>
                {stats.processing}
              </Text>
            </View>
            <View
              style={[
                styles.stat,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Completed
              </Text>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>
                {stats.completed}
              </Text>
            </View>
            <View
              style={[
                styles.stat,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Rejected
              </Text>
              <Text style={[styles.statValue, { color: theme.colors.danger }]}>
                {stats.rejected}
              </Text>
            </View>
          </View>

          <View style={styles.selectorsRow}>
            <View style={styles.selectorWrap}>
              <Pressable
                onPress={() => {
                  setStatusOpen((v) => !v);
                  setSortOpen(false);
                }}
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
                  {statusOptions.map((value) => (
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

            <View style={styles.selectorWrap}>
              <Pressable
                onPress={() => {
                  setSortOpen((v) => !v);
                  setStatusOpen(false);
                }}
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
                    Sort: {draftSort}
                  </Text>
                  <Ionicons
                    name={sortOpen ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={theme.colors.textMuted}
                  />
                </View>
              </Pressable>
              {sortOpen ? (
                <View
                  style={[
                    styles.dropdown,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {sortOptions.map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setDraftSort(value);
                        setSortOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        {
                          backgroundColor:
                            draftSort === value
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
                        {value}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => {
              setStatusFilter(draftStatus);
              setSortMode(draftSort);
              setStatusOpen(false);
              setSortOpen(false);
            }}
            style={[
              styles.applyBtn,
              { backgroundColor: theme.colors.secondary },
            ]}
          >
            <Text style={styles.applyBtnText}>Apply Filters</Text>
          </Pressable>

          {filteredOrders.map((order) => {
            const normalizedStatus = normalizeOrderStatus(order.status);
            const lifecycle = toLifecycleStatus(order.status);
            const activeStep = getTimelineStep(normalizedStatus);
            const expanded = expandedOrderId === order.id;
            const orderNumber = order.order_number || `Order #${order.id}`;

            const stageColor =
              normalizedStatus === "completed"
                ? theme.colors.success
                : normalizedStatus === "processing"
                  ? theme.colors.warning
                  : normalizedStatus === "approved"
                    ? theme.colors.secondary
                    : normalizedStatus === "rejected"
                      ? theme.colors.danger
                      : theme.colors.primary;

            return (
              <View
                key={order.id}
                style={[
                  styles.row,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <View style={styles.orderTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.colors.text }]}>
                      {orderNumber}
                    </Text>
                    <Text
                      style={[
                        styles.subtitle,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      {order.created_at
                        ? new Date(order.created_at).toLocaleString()
                        : "No date"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: stageColor + "22" },
                    ]}
                  >
                    <Text
                      style={[styles.statusPillText, { color: stageColor }]}
                    >
                      {normalizedStatus === "rejected"
                        ? "DISAPPROVED"
                        : statusLabel(lifecycle).toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.stageMeaning, { color: stageColor }]}>
                  {getStageMeaning(normalizedStatus)}
                </Text>

                <Text style={[styles.decisionText, { color: stageColor }]}>
                  {getDecisionSummary(normalizedStatus, orderNumber)}
                </Text>

                <View
                  style={[
                    styles.timelineRow,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {(
                    [
                      "Submitted",
                      "Approved",
                      "Processing",
                      "Completed",
                    ] as const
                  ).map((label, index) => {
                    const step = index + 1;
                    const isDone = activeStep >= step;
                    const isRejected = normalizedStatus === "rejected";
                    return (
                      <View key={label} style={styles.timelineStepWrap}>
                        <View
                          style={[
                            styles.timelineDot,
                            {
                              backgroundColor: isRejected
                                ? step === 1
                                  ? theme.colors.danger
                                  : theme.colors.surfaceMuted
                                : isDone
                                  ? theme.colors.success
                                  : theme.colors.surfaceMuted,
                              borderColor: isRejected
                                ? theme.colors.danger
                                : isDone
                                  ? theme.colors.success
                                  : theme.colors.border,
                            },
                          ]}
                        />
                        {index < 3 ? (
                          <View
                            style={[
                              styles.timelineLine,
                              {
                                backgroundColor: isRejected
                                  ? theme.colors.border
                                  : activeStep > step
                                    ? theme.colors.success
                                    : theme.colors.border,
                              },
                            ]}
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.timelineLabel,
                            {
                              color: isRejected
                                ? step === 1
                                  ? theme.colors.danger
                                  : theme.colors.textMuted
                                : isDone
                                  ? theme.colors.success
                                  : theme.colors.textMuted,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: theme.colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${getProgressPercent(normalizedStatus)}%`,
                        backgroundColor:
                          normalizedStatus === "rejected"
                            ? theme.colors.danger
                            : theme.colors.success,
                      },
                    ]}
                  />
                </View>

                <View style={styles.metaRow}>
                  <Text
                    style={[styles.metaText, { color: theme.colors.textMuted }]}
                  >
                    Priority: {(order.priority || "standard").toUpperCase()}
                  </Text>
                  <Text
                    style={[styles.metaText, { color: theme.colors.textMuted }]}
                  >
                    Samples: {order.sample_count ?? 0}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setExpandedOrderId(expanded ? null : order.id)}
                  style={[
                    styles.detailsBtn,
                    { backgroundColor: theme.colors.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.detailsBtnText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {expanded ? "Hide Details" : "View Details"}
                  </Text>
                </Pressable>

                {expanded ? (
                  <View
                    style={[
                      styles.detailsBox,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Order ID: {order.id}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Order Number: {orderNumber}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Status: {statusLabel(lifecycle)}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Decision Summary:{" "}
                      {getDecisionSummary(normalizedStatus, orderNumber)}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Meaning: {getStageMeaning(normalizedStatus)}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Customer: {order.customer_name || "N/A"}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Priority: {(order.priority || "standard").toUpperCase()}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Sample Count: {order.sample_count ?? 0}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Created:{" "}
                      {order.created_at
                        ? new Date(order.created_at).toLocaleString()
                        : "N/A"}
                    </Text>
                    <Text
                      style={[styles.detailLine, { color: theme.colors.text }]}
                    >
                      Estimated Completion:{" "}
                      {order.estimated_completion
                        ? new Date(order.estimated_completion).toLocaleString()
                        : "N/A"}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          {filteredOrders.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              No orders match the selected filter.
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  banner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  bannerSub: { fontSize: 11, fontWeight: "700" },
  syncText: { fontSize: 11, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stat: {
    width: "31%",
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  statLabel: { fontSize: 11, fontWeight: "700" },
  statValue: { marginTop: 4, fontSize: 20, fontWeight: "800" },
  selectorsRow: { flexDirection: "row", gap: 8 },
  selectorWrap: { flex: 1, zIndex: 3 },
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
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  orderTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 14, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "600" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  stageMeaning: { fontSize: 12, fontWeight: "700" },
  decisionText: { fontSize: 11, fontWeight: "700" },
  timelineRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  timelineStepWrap: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  timelineLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    borderRadius: 4,
  },
  timelineLabel: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 9,
    fontWeight: "700",
  },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  metaText: { fontSize: 11, fontWeight: "700" },
  detailsBtn: { borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  detailsBtnText: { fontSize: 12, fontWeight: "800" },
  detailsBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  detailLine: { fontSize: 12, fontWeight: "600" },
  emptyText: { fontSize: 12, fontWeight: "700" },
});
