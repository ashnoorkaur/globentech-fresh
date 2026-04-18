import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { clearScreenCache, useCachedScreenState } from "../hooks/use-screen-cache";
import { backendDateTimeValue, formatBackendDateTime } from "../lib/date-time";
import { normalizeOrderStatusForCompare } from "../lib/order-status-normalize";
import { normalizeOrderPriorityValue } from "../lib/order-workflow";
import {
    clearCustomerOrderDetailsCache,
    fetchCustomerMyOrders,
    type CustomerOrderRow,
} from "../lib/orders-api";
import { useAppTheme } from "../lib/theme";

type StatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "payment"
  | "processing"
  | "completed"
  | "rejected";
type SortMode = "newest" | "oldest" | "priority" | "priority_standard";

const statusOptions: StatusFilter[] = [
  "all",
  "pending",
  "approved",
  "payment",
  "processing",
  "completed",
  "rejected",
];
const sortOptions: SortMode[] = ["newest", "oldest", "priority", "priority_standard"];

const sortModeLabel = (mode: SortMode) => {
  if (mode === "newest") return "Newest";
  if (mode === "oldest") return "Oldest";
  if (mode === "priority") return "High first";
  return "Standard first";
};

/** Buckets customer stats/filters the same way we compare orders to the PHP site (substring + aliases). */
const normalizeOrderStatus = (value?: string): StatusFilter => {
  const bucket = normalizeOrderStatusForCompare(value);
  if (bucket === "rejected") return "rejected";
  if (bucket === "completed") return "completed";
  if (bucket === "payment_pending") return "payment";
  if (bucket === "processing") return "processing";
  if (bucket === "approved") return "approved";
  return "pending";
};

const getTimelineStep = (status: StatusFilter) => {
  if (status === "pending") return 1;
  if (status === "approved") return 2;
  if (status === "payment") return 3;
  if (status === "processing") return 4;
  if (status === "completed") return 5;
  return 0;
};

const getProgressPercent = (status: StatusFilter) => {
  if (status === "pending") return 20;
  if (status === "approved") return 40;
  if (status === "payment") return 60;
  if (status === "processing") return 80;
  if (status === "completed") return 100;
  return 0;
};

const getStageMeaning = (status: StatusFilter) => {
  if (status === "pending") return "Waiting for admin review.";
  if (status === "approved") return "Approved by admin.";
  if (status === "payment") return "Payment required to continue.";
  if (status === "processing") return "Technician is working on this order.";
  if (status === "completed") return "Testing is complete and results are ready.";
  return "This order was rejected by admin.";
};

const getDecisionSummary = (status: StatusFilter, orderNumber: string) => {
  if (status === "rejected") {
    return `Admin Decision: Rejected - ${orderNumber} was not approved.`;
  }
  if (status === "payment") {
    return `Admin Decision: Accepted - ${orderNumber} is now waiting for customer payment.`;
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

const formatDisplayCase = (value?: string | null) => {
  if (!value) return "";
  return value.trim().replace(/\b[a-z]/g, (char) => char.toUpperCase());
};

const statusDisplayLabel = (status: StatusFilter) => {
  if (status === "rejected") return "DISAPPROVED";
  if (status === "pending") return "SUBMITTED";
  if (status === "payment") return "PAYMENT";
  return status.toUpperCase();
};

const hasValue = (value?: string | number | null) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return value.trim().length > 0;
};

const formatDateTime = (value?: string | null, fallback = "N/A") => {
  return formatBackendDateTime(value, fallback);
};

const displayText = (value?: string | number | null, fallback = "Not provided") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
};

const formatQuantityText = (
  quantity?: number | null,
  unit?: string | null,
  fallback = "Not provided",
) => {
  if (typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0) {
    return `${quantity} ${unit || ""}`.trim();
  }
  return fallback;
};

const getRequestSummary = (order: CustomerOrderRow) => {
  return [
    `Type: ${displayText(formatDisplayCase(order.sample_type), "Not provided")}`,
    `Compound: ${displayText(formatDisplayCase(order.compound_name), order.notes ? "See notes" : "Not provided")}`,
    `Quantity: ${formatQuantityText(order.quantity, order.unit, "Not provided")}`,
  ].join(" • ");
};

const getOrderAmount = (order: CustomerOrderRow) => {
  const sampleCount = Math.max(
    1,
    Number(order.sample_count ?? order.quantity ?? 1) || 1,
  );
  const priorityFee = normalizeOrderPriorityValue(order.priority) === "high" ? 50 : 0;
  const extraSamples = Math.max(0, sampleCount - 1) * 25;
  return 150 + priorityFee + extraSamples;
};

const isTemporaryDemoOrder = (order: CustomerOrderRow) => {
  const orderRef = `${order.order_number || ""}`.toLowerCase();
  const notes = `${order.notes || ""}`.toLowerCase();
  return /teacher-demo|final-demo/.test(`${orderRef} ${notes}`);
};

export default function CustomerMyOrdersPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const previousStatusByIdRef = useRef<Record<string, StatusFilter>>({});
  const [orders, setOrders] = useCachedScreenState<CustomerOrderRow[]>(
    "customer-my-orders:orders:v11",
    [],
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [draftStatus, setDraftStatus] = useState<StatusFilter>("all");
  const [draftSort, setDraftSort] = useState<SortMode>("newest");
  const [statusOpen, setStatusOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "customer-my-orders:lastUpdated:v11",
    "",
  );

  const loadData = useCallback(async (opts?: { bustCaches?: boolean }) => {
    if (opts?.bustCaches) {
      clearScreenCache("customer-my-orders");
      clearCustomerOrderDetailsCache();
    }
    try {
      const rows = (await fetchCustomerMyOrders()).filter(
        (row) => !isTemporaryDemoOrder(row),
      );
      const previous = previousStatusByIdRef.current;
      const hasPreviousSnapshot = Object.keys(previous).length > 0;
      const nextSnapshot: Record<string, StatusFilter> = {};
      const movedToPayment: string[] = [];
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
        if (nextStatus === "payment") movedToPayment.push(label);
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
      } else if (movedToPayment.length > 0) {
        const first = movedToPayment[0];
        const remaining = movedToPayment.length - 1;
        feedback.showInfo(
          "Payment Required",
          remaining > 0
            ? `${first} and ${remaining} more order(s) are awaiting customer payment.`
            : `${first} was approved and is now awaiting payment.`,
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
      // Keep the last successful snapshot visible.
    }
  }, [feedback, setLastUpdated, setOrders]);

  useFocusedPolling(loadData, { intervalMs: 20000 });

  const stats = useMemo(() => {
    const submitted = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "pending",
    ).length;
    const approved = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "approved",
    ).length;
    const payment = orders.filter(
      (o) => normalizeOrderStatus(o.status) === "payment",
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
    return { submitted, approved, payment, processing, completed, rejected };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalized = [...orders].filter((order) => {
      if (statusFilter === "all") return true;
      return normalizeOrderStatus(order.status) === statusFilter;
    });

    normalized.sort((a, b) => {
      const aTime = backendDateTimeValue(a.created_at);
      const bTime = backendDateTimeValue(b.created_at);

      if (sortMode === "priority") {
        const ap = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
        const bp = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return bTime - aTime;
      }
      if (sortMode === "priority_standard") {
        const ap = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
        const bp = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return bTime - aTime;
      }
      if (sortMode === "newest") return bTime - aTime;
      return aTime - bTime;
    });

    return normalized;
  }, [orders, sortMode, statusFilter]);

  const openPaymentPage = useCallback((order: CustomerOrderRow) => {
    router.push({
      pathname: "/customer-checkout",
      params: {
        orderId: String(order.id),
        orderNumber: order.order_number || `ORD-${order.id}`,
        priority: order.priority || "standard",
        sampleCount: String(order.sample_count ?? 1),
        sampleType: order.sample_type || "",
        compoundName: order.compound_name || "",
        quantity: String(order.quantity ?? ""),
        unit: order.unit || "",
        amount: String(getOrderAmount(order)),
      },
    });
  }, []);

  return (
    <RoleContentPage
      title="My Orders"
      subtitle="Track where each order stands from submission to completion."
      role="Customer"
      activeKey="my-orders"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <View style={styles.pageContent}>
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
              Your Orders
            </Text>
            <Text style={[styles.bannerSub, { color: theme.colors.textMuted }]}>
              Exact submitted date and time are shown below for each order.
            </Text>
            <Text style={[styles.bannerSub, { color: theme.colors.textMuted }]}>
              Use Pay Now on any non-rejected order to continue.
            </Text>
          </View>

          <View style={styles.syncRow}>
            <Text style={[styles.syncText, { color: theme.colors.textMuted }]}>
              Live Updated: {lastUpdated || "--"}
            </Text>
            <Pressable
              onPress={() => void loadData({ bustCaches: true })}
              hitSlop={10}
              style={styles.refreshPressable}
            >
              <Text style={[styles.refreshText, { color: theme.colors.primary }]}>
                Refresh
              </Text>
            </Pressable>
          </View>

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
                Payment Due
              </Text>
              <Text style={[styles.statValue, { color: theme.colors.info }]}>
                {stats.payment}
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
                    Sort: {sortModeLabel(draftSort)}
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
                        {sortModeLabel(value)}
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
          <View style={styles.ordersList}>
            {filteredOrders.length === 0 ? (
              <Text
                style={[styles.emptyText, { color: theme.colors.textMuted }]}
              >
                No orders match the selected filter.
              </Text>
            ) : (
              filteredOrders.map((order) => {
              const normalizedStatus = normalizeOrderStatus(order.status);
              const activeStep = getTimelineStep(normalizedStatus);
              const expanded = expandedOrderId === order.id;
              const orderNumber = order.order_number || `Order #${order.id}`;
              const rejectionReason = order.rejection_reason?.trim();
              const priorityNorm = normalizeOrderPriorityValue(order.priority);
              const stageColor =
                normalizedStatus === "completed"
                  ? theme.colors.success
                  : normalizedStatus === "processing"
                    ? theme.colors.warning
                    : normalizedStatus === "payment"
                      ? theme.colors.info
                      : normalizedStatus === "approved"
                        ? theme.colors.secondary
                        : normalizedStatus === "rejected"
                          ? theme.colors.danger
                          : theme.colors.primary;

              return (
                <View
                  key={String(order.id)}
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
                      <Text
                        style={[styles.title, { color: theme.colors.text }]}
                      >
                        {orderNumber}
                      </Text>
                      <Text
                        style={[
                          styles.subtitle,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        Submitted: {formatDateTime(order.created_at, "No date")}
                      </Text>
                    </View>

                    <View style={styles.pillRow}>
                      <View
                        style={[
                          styles.priorityPill,
                          {
                            backgroundColor:
                              (priorityNorm === "high"
                                ? theme.colors.danger
                                : theme.colors.warning) + "22",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityPillText,
                            {
                              color:
                                priorityNorm === "high"
                                  ? theme.colors.danger
                                  : theme.colors.warning,
                            },
                          ]}
                        >
                          {priorityNorm === "high" ? "HIGH" : "STANDARD"}
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
                          {statusDisplayLabel(normalizedStatus)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.stageMeaning, { color: stageColor }]}>
                    {getStageMeaning(normalizedStatus)}
                  </Text>
                  <Text style={[styles.requestText, { color: theme.colors.textMuted }]}> 
                    Requested: {getRequestSummary(order)}
                  </Text>
                  {normalizedStatus === "payment" ? (
                    <Text style={[styles.rejectionText, { color: theme.colors.info }]}>
                      Customer payment is still needed before processing starts.
                    </Text>
                  ) : null}
                  {normalizedStatus === "rejected" && rejectionReason ? (
                    <Text style={[styles.rejectionText, { color: theme.colors.danger }]}>
                      Rejection Reason: {rejectionReason}
                    </Text>
                  ) : null}

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
                        "Payment",
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
                          {index < 4 ? (
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
                      style={[
                        styles.metaText,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      Priority: {priorityNorm === "high" ? "HIGH" : "STANDARD"}
                    </Text>
                    <Text
                      style={[
                        styles.metaText,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      Total: ${getOrderAmount(order).toFixed(2)} CAD
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    {normalizedStatus !== "rejected" ? (
                      <Pressable
                        onPress={() => void openPaymentPage(order)}
                        style={[
                          styles.payBtn,
                          { backgroundColor: theme.colors.primary },
                        ]}
                      >
                        <Text style={styles.payBtnText}>Pay Now</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() =>
                        setExpandedOrderId(expanded ? null : order.id)
                      }
                      style={[
                        styles.detailsBtn,
                        {
                          backgroundColor: theme.colors.surface,
                          flex: normalizedStatus !== "rejected" ? 1 : undefined,
                        },
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
                  </View>

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
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Order ID: {order.id}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Order Number: {orderNumber}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Status: {statusDisplayLabel(normalizedStatus)}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Decision Summary:{" "}
                        {getDecisionSummary(normalizedStatus, orderNumber)}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Meaning: {getStageMeaning(normalizedStatus)}
                      </Text>
                      {hasValue(order.customer_name) ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Customer: {order.customer_name}
                        </Text>
                      ) : null}
                      {hasValue(order.company_name) ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Company: {order.company_name}
                        </Text>
                      ) : null}
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Priority: {priorityNorm === "high" ? "HIGH" : "STANDARD"}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Sample Type: {displayText(formatDisplayCase(order.sample_type), "Not provided")}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Compound Name: {displayText(formatDisplayCase(order.compound_name), order.notes ? "See notes" : "Not provided")}
                      </Text>
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Quantity: {formatQuantityText(order.quantity, order.unit, "Check order details")}
                      </Text>
                      {hasValue(order.assigned_technician_name) ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Assigned Technician: {order.assigned_technician_name}
                        </Text>
                      ) : null}
                      {hasValue(order.equipment_name) ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Equipment: {order.equipment_name}
                        </Text>
                      ) : null}
                      {hasValue(order.scheduled_start) ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Scheduled Start: {formatDateTime(order.scheduled_start)}
                        </Text>
                      ) : null}
                      {hasValue(order.scheduled_end) ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Scheduled End: {formatDateTime(order.scheduled_end)}
                        </Text>
                      ) : null}
                      {order.notes ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Notes: {order.notes}
                        </Text>
                      ) : null}
                      {order.technician_status_note ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Technician Update: {order.technician_status_note}
                        </Text>
                      ) : null}
                      {order.technician_status_updated_at ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Update Time: {formatDateTime(order.technician_status_updated_at)}
                          {order.technician_status_updated_by
                            ? ` by ${order.technician_status_updated_by}`
                            : ""}
                        </Text>
                      ) : null}
                      <Text
                        style={[
                          styles.detailLine,
                          { color: theme.colors.text },
                        ]}
                      >
                        Created:{" "}
                        {formatDateTime(order.created_at)}
                      </Text>
                      {order.estimated_completion ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.text },
                          ]}
                        >
                          Estimated Completion:{" "}
                          {formatDateTime(order.estimated_completion)}
                        </Text>
                      ) : null}
                      {rejectionReason ? (
                        <Text
                          style={[
                            styles.detailLine,
                            { color: theme.colors.danger },
                          ]}
                        >
                          Admin Rejection Reason: {rejectionReason}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
              })
            )}
          </View>
        </View>
      </View>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  pageContent: { paddingBottom: 8 },
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
  bannerSub: { fontSize: 11, fontWeight: "700", lineHeight: 16 },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  syncText: { fontSize: 11, fontWeight: "700", flex: 1 },
  refreshPressable: { paddingVertical: 4, paddingHorizontal: 6 },
  refreshText: { fontSize: 12, fontWeight: "800" },
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
  ordersList: { gap: 10, paddingBottom: 12 },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  orderTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  priorityPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  priorityPillText: { fontSize: 10, fontWeight: "800" },
  title: { fontSize: 14, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "600" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  stageMeaning: { fontSize: 12, fontWeight: "700" },
  decisionText: { fontSize: 11, fontWeight: "700" },
  requestText: { fontSize: 11, fontWeight: "600", lineHeight: 16 },
  rejectionText: { fontSize: 11, fontWeight: "700" },
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
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  metaText: { fontSize: 11, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  payBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  payBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  detailsBtn: { borderRadius: 8, paddingVertical: 8, alignItems: "center", paddingHorizontal: 12 },
  detailsBtnText: { fontSize: 12, fontWeight: "800" },
  detailsBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  detailLine: { fontSize: 12, fontWeight: "600" },
  emptyText: { fontSize: 12, fontWeight: "700" },
});
