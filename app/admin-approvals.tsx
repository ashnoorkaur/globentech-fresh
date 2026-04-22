import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { hasCachedScreenState, useCachedScreenState } from "../hooks/use-screen-cache";
import {
    approveOrder,
    fetchPendingOrders,
    rejectOrder,
    resetPendingApprovalsClientCaches,
    type PendingOrderDto,
} from "../lib/admin-api";
import { backendDateTimeValue, formatBackendDateTime } from "../lib/date-time";
import { normalizeOrderPriorityValue } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

type DecisionRecord = {
  orderId: number;
  orderNumber: string;
  customerName: string;
  companyName?: string;
  sampleCount: number;
  priority: string;
  decision: "approved" | "rejected";
  rejectionReason?: string;
  decidedAt: string;
};

const hasValue = (value?: string | number | null) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return value.trim().length > 0 && value.trim() !== "-";
};

const formatDisplayCase = (value?: string | null) => {
  if (!value) return "";
  return value.trim().replace(/\b[a-z]/g, (char) => char.toUpperCase());
};

const formatQuantityText = (
  quantity?: number,
  unit?: string | null,
  sampleCount?: number,
) => {
  if (typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0) {
    return `${quantity} ${unit || ""}`.trim();
  }
  if (typeof sampleCount === "number" && sampleCount > 1) {
    return `${sampleCount} sample(s)`;
  }
  return "Not provided";
};

const normalizeLookup = (value?: string | number | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isNewOrder = (value?: string | null) => {
  const timestamp = backendDateTimeValue(value);
  if (!timestamp) return false;
  return Date.now() - timestamp <= 12 * 60 * 60 * 1000;
};

const pendingApprovalsFingerprint = (rows: PendingOrderDto[]) =>
  rows
    .map((r) =>
      [
        r.id,
        (r.order_number || "").trim().toUpperCase(),
        normalizeOrderPriorityValue(r.priority),
        (r.status || "").trim().toLowerCase(),
        r.sample_count ?? 0,
      ].join("\t"),
    )
    .sort()
    .join("|");

export default function AdminApprovalsPage() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ highlight?: string }>();
  const [orders, setOrders] = useCachedScreenState<PendingOrderDto[]>(
    "admin-approvals:orders:v16",
    [],
  );
  const initialFetchDoneRef = useRef(hasCachedScreenState("admin-approvals:orders:v16"));
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("admin-approvals:orders:v16"),
  );
  const [syncing, setSyncing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-approvals:lastUpdated:v13",
    "",
  );
  const [recentDecisions, setRecentDecisions] = useCachedScreenState<DecisionRecord[]>(
    "admin-approvals:recentDecisions",
    [],
  );
  const [rejectOrderTarget, setRejectOrderTarget] = useState<PendingOrderDto | null>(null);
  const [detailOrderTarget, setDetailOrderTarget] = useState<PendingOrderDto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [sortMode, setSortMode] = useState<
    "newest" | "oldest" | "priority_high" | "priority_standard"
  >("newest");
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();

  const pushDecision = (
    order: PendingOrderDto,
    decision: DecisionRecord["decision"],
    rejectionReason?: string,
  ) => {
    const record: DecisionRecord = {
      orderId: order.id,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      companyName: order.company_name,
      sampleCount: order.sample_count,
      priority: normalizeOrderPriorityValue(order.priority),
      decision,
      rejectionReason,
      decidedAt: new Date().toLocaleString(),
    };

    setRecentDecisions([record]);
  };

  const latestDecision = recentDecisions[0];

  const loadQueue = useCallback(async () => {
    resetPendingApprovalsClientCaches();
    setErrorText("");
    if (!initialFetchDoneRef.current) {
      setLoading(true);
    } else {
      setSyncing(true);
    }
    try {
      const pending = await fetchPendingOrders();
      setOrders((prev) => {
        if (pendingApprovalsFingerprint(prev) === pendingApprovalsFingerprint(pending)) {
          return prev;
        }
        queueMicrotask(() => setLastUpdated(new Date().toLocaleTimeString()));
        return pending;
      });
      initialFetchDoneRef.current = true;
    } catch (error) {
      const errorMsg = error instanceof Error
        ? error.message
        : "Failed to load pending approvals.";
      const isSessionError = errorMsg.toLowerCase().includes("session");
      const helpText = isSessionError
        ? `${errorMsg}\n\nTry logging out and logging back in to restore your session.`
        : errorMsg;
      setErrorText(helpText);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [setOrders, setLastUpdated]);

  useFocusedPolling(loadQueue, {
    intervalMs: 0,
    minGapMs: 400,
    pollWhileFocused: false,
    subscribeToLiveData: false,
    reloadOnAppActive: false,
    runOnMount: true,
    runOnFocus: true,
  });

  const highlightOrderNumber = useMemo(
    () => normalizeLookup(typeof params.highlight === "string" ? params.highlight : ""),
    [params.highlight],
  );

  const sortedOrders = useMemo(() => {
    const next = [...orders];

    next.sort((left, right) => {
      const leftHighlighted =
        highlightOrderNumber &&
        normalizeLookup(left.order_number) === highlightOrderNumber;
      const rightHighlighted =
        highlightOrderNumber &&
        normalizeLookup(right.order_number) === highlightOrderNumber;

      if (leftHighlighted && !rightHighlighted) return -1;
      if (!leftHighlighted && rightHighlighted) return 1;

      if (sortMode === "priority_high") {
        const leftPriority = normalizeOrderPriorityValue(left.priority) === "high" ? 1 : 0;
        const rightPriority = normalizeOrderPriorityValue(right.priority) === "high" ? 1 : 0;
        if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      }
      if (sortMode === "priority_standard") {
        const leftPriority = normalizeOrderPriorityValue(left.priority) === "high" ? 1 : 0;
        const rightPriority = normalizeOrderPriorityValue(right.priority) === "high" ? 1 : 0;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      }

      const leftTime = backendDateTimeValue(left.created_at);
      const rightTime = backendDateTimeValue(right.created_at);

      if (sortMode === "oldest") {
        return leftTime - rightTime;
      }

      return rightTime - leftTime;
    });

    return next;
  }, [highlightOrderNumber, orders, sortMode]);

  const newestOrderNumber = useMemo(() => {
    const newest = [...orders].sort(
      (left, right) => backendDateTimeValue(right.created_at) - backendDateTimeValue(left.created_at),
    )[0];
    return normalizeLookup(newest?.order_number);
  }, [orders]);

  const stats = useMemo(() => {
    const pending = orders.length;
    const high = orders.filter(
      (item) => normalizeOrderPriorityValue(item.priority) === "high",
    ).length;
    const standard = orders.filter(
      (item) => normalizeOrderPriorityValue(item.priority) === "standard",
    ).length;
    return { pending, high, standard };
  }, [orders]);

  const runApprove = async (order: PendingOrderDto) => {
    setBusyId(order.id);
    try {
      await approveOrder(order);
      await loadQueue();
      pushDecision(order, "approved");
      setMessageText(
        `${order.order_number} approved for ${order.customer_name} (${order.sample_count} sample(s), ${normalizeOrderPriorityValue(order.priority) === "high" ? "HIGH" : "STANDARD"} priority).`,
      );
      feedback.showSuccess(
        "Order Approved",
        `${order.order_number} approved. Customer and technician views will show this order in the accepted flow.`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to approve order.";
      const isSessionError = errorMsg.toLowerCase().includes("session");
      const helpText = isSessionError
        ? `${errorMsg}\n\nTry logging out and logging back in to restore your session.`
        : errorMsg;
      feedback.showError(
        "Approval Failed",
        helpText,
      );
    } finally {
      setBusyId(null);
    }
  };

  const runReject = async (order: PendingOrderDto, reason: string) => {
    setBusyId(order.id);
    try {
      await rejectOrder(order, reason);
      await loadQueue();
      pushDecision(order, "rejected", reason);
      setMessageText(
        `${order.order_number} rejected for ${order.customer_name}. Reason: ${reason}`,
      );
      feedback.showSuccess(
        "Order Rejected",
        `${order.order_number} was rejected. Customer will see the rejection reason.`,
      );
      setRejectOrderTarget(null);
      setRejectReason("");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to reject order.";
      const isSessionError = errorMsg.toLowerCase().includes("session");
      const helpText = isSessionError
        ? `${errorMsg}\n\nTry logging out and logging back in to restore your session.`
        : errorMsg;
      feedback.showError(
        "Rejection Failed",
        helpText,
      );
    } finally {
      setBusyId(null);
    }
  };

  const actionGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];
  const successGradient: [string, string] = ["#16A34A", "#22C55E"];
  const dangerGradient: [string, string] = ["#DC2626", "#F97316"];

  return (
    <RoleContentPage
      title="Pending Approvals"
      subtitle="Review and approve or reject submitted orders."
      activeKey="approvals"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
    >
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <View style={[styles.summaryRow, { flexWrap: "wrap" }]}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Pending
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.primary }]}
            >
              {stats.pending}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Standard
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.warning }]}>
              {stats.standard}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              High
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.danger }]}>
              {stats.high}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Last Updated
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.info }]}>
              {lastUpdated || "--"}
            </Text>
          </View>
        </View>

        {messageText ? (
          <View
            style={[
              styles.messageBox,
              {
                backgroundColor: theme.colors.success + "20",
                borderColor: theme.colors.success,
              },
            ]}
          >
            <Text style={[styles.messageText, { color: theme.colors.success }]}>
              {messageText}
            </Text>
          </View>
        ) : null}

        {errorText ? (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            {errorText}
          </Text>
        ) : null}

        {latestDecision ? (
          <View
            style={[
              styles.historyWrap,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.historyTitle, { color: theme.colors.text }]}>
              Latest Decision
            </Text>
            <Text
              style={[styles.historySub, { color: theme.colors.textMuted }]}
            >
              Only the most recent approval or rejection is shown here.
            </Text>
            <View
              style={[
                styles.historyRow,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <View style={styles.historyTopRow}>
                <Text
                  style={[styles.historyOrder, { color: theme.colors.text }]}
                >
                  {latestDecision.orderNumber}
                </Text>
                <Text
                  style={[
                    styles.historyDecision,
                    {
                      color:
                        latestDecision.decision === "approved"
                          ? theme.colors.success
                          : theme.colors.danger,
                    },
                  ]}
                >
                  {latestDecision.decision.toUpperCase()}
                </Text>
              </View>
              <Text
                style={[
                  styles.historyMeta,
                  { color: theme.colors.textMuted },
                ]}
              >
                Customer: {latestDecision.customerName} | Company:{" "}
                {latestDecision.companyName || "-"}
              </Text>
              <Text
                style={[
                  styles.historyMeta,
                  { color: theme.colors.textMuted },
                ]}
              >
                Samples: {latestDecision.sampleCount} | Priority:{" "}
                {latestDecision.priority.toUpperCase()} | Order ID: {latestDecision.orderId}
              </Text>
              <Text
                style={[
                  styles.historyMeta,
                  { color: theme.colors.textMuted },
                ]}
              >
                Decided: {latestDecision.decidedAt}
              </Text>
              {latestDecision.rejectionReason ? (
                <Text
                  style={[
                    styles.historyMeta,
                    { color: theme.colors.danger },
                  ]}
                >
                  Reason: {latestDecision.rejectionReason}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.listWrap,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.listTitle, { color: theme.colors.text }]}>
            Pending Orders
          </Text>
          <Text style={[styles.listSub, { color: theme.colors.textMuted }]}>
            Every pending order is listed below. Sort only changes order; it does not hide standard or high priority rows.
          </Text>

          <View style={styles.sortRow}>
            {([
              ["newest", "Newest"],
              ["oldest", "Oldest"],
              ["priority_high", "High first"],
              ["priority_standard", "Standard first"],
            ] as const).map(([value, label]) => {
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
                  <Text style={[styles.sortChipText, { color: active ? theme.colors.primary : theme.colors.textMuted }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {highlightOrderNumber ? (
            <Text style={[styles.findingText, { color: theme.colors.primary }]}>
              Highlighted order is moved to the top for easier review.
            </Text>
          ) : null}

          {sortedOrders.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              No pending orders
            </Text>
          ) : (
            sortedOrders.map((order) => (
              <View
                key={order.id}
                style={[
                  styles.orderCard,
                  {
                    borderColor:
                      highlightOrderNumber && normalizeLookup(order.order_number) === highlightOrderNumber
                        ? theme.colors.primary
                        : theme.colors.border,
                    backgroundColor:
                      highlightOrderNumber && normalizeLookup(order.order_number) === highlightOrderNumber
                        ? theme.colors.primarySoft
                        : theme.colors.surfaceMuted,
                  },
                ]}
              >
                <View style={styles.orderTopRow}>
                  <Text
                    style={[styles.orderNumber, { color: theme.colors.text }]}
                  >
                    {order.order_number}
                  </Text>
                  <View style={styles.badgeRow}>
                    {normalizeLookup(order.order_number) === newestOrderNumber && isNewOrder(order.created_at) ? (
                      <Text
                        style={[
                          styles.newBadge,
                          {
                            color: theme.colors.success,
                            backgroundColor: theme.colors.success + "20",
                          },
                        ]}
                      >
                        NEW
                      </Text>
                    ) : null}
                    {highlightOrderNumber && normalizeLookup(order.order_number) === highlightOrderNumber ? (
                      <Text
                        style={[
                          styles.newBadge,
                          {
                            color: theme.colors.primary,
                            backgroundColor: theme.colors.primary + "20",
                          },
                        ]}
                      >
                        MATCH
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.priorityBadge,
                        {
                          color:
                            normalizeOrderPriorityValue(order.priority) === "high"
                              ? theme.colors.danger
                              : theme.colors.warning,
                          backgroundColor:
                            normalizeOrderPriorityValue(order.priority) === "high"
                              ? theme.colors.danger + "20"
                              : theme.colors.warning + "20",
                        },
                      ]}
                    >
                      {normalizeOrderPriorityValue(order.priority) === "high"
                        ? "HIGH"
                        : "STANDARD"}
                    </Text>
                  </View>
                </View>

                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Customer
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {order.customer_name}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Company
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {order.company_name || "-"}
                  </Text>
                </View>
                {hasValue(order.sample_type) ? (
                  <View style={styles.kvRow}>
                    <Text
                      style={[styles.kvKey, { color: theme.colors.textMuted }]}
                    >
                      Sample Type
                    </Text>
                    <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                      {formatDisplayCase(order.sample_type)}
                    </Text>
                  </View>
                ) : null}
                {hasValue(order.compound_name) ? (
                  <View style={styles.kvRow}>
                    <Text
                      style={[styles.kvKey, { color: theme.colors.textMuted }]}
                    >
                      Compound
                    </Text>
                    <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                      {formatDisplayCase(order.compound_name)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Quantity
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {formatQuantityText(order.quantity, order.unit, order.sample_count)}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Submitted
                  </Text>
                  <Text
                    style={[styles.kvValue, { color: theme.colors.textMuted }]}
                  >
                    {formatBackendDateTime(order.created_at)}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  <GradientButton
                    onPress={() => setDetailOrderTarget(order)}
                    disabled={busyId === order.id}
                    style={styles.actionBtn}
                    colors={actionGradient}
                    compact
                  >
                    <Text numberOfLines={1} style={styles.actionBtnText}>Details</Text>
                  </GradientButton>
                  <GradientButton
                    onPress={() =>
                      confirm.openConfirm({
                        title: "Approve Order",
                        message: `Approve ${order.order_number}?`,
                        confirmText: "Approve",
                        onConfirm: () => runApprove(order),
                      })
                    }
                    disabled={busyId === order.id}
                    style={styles.actionBtn}
                    colors={successGradient}
                    compact
                  >
                    <Text numberOfLines={1} style={styles.actionBtnText}>Approve</Text>
                  </GradientButton>
                  <GradientButton
                    onPress={() => {
                      setRejectOrderTarget(order);
                      setRejectReason("");
                    }}
                    disabled={busyId === order.id}
                    style={styles.actionBtn}
                    colors={dangerGradient}
                    compact
                  >
                    <Text numberOfLines={1} style={styles.actionBtnText}>Reject</Text>
                  </GradientButton>
                </View>
              </View>
            ))
          )}
        </View>

        <GradientButton
          onPress={loadQueue}
          disabled={loading || syncing}
          style={styles.refreshBtn}
          colors={actionGradient}
          compact
        >
          <Text style={styles.refreshBtnText}>
            {loading ? "Loading..." : syncing ? "Syncing..." : "Refresh"}
          </Text>
        </GradientButton>
      </View>
      {feedback.modal}
      <Modal
        visible={Boolean(detailOrderTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailOrderTarget(null)}
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
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Order Details</Text>
                <Pressable
                  onPress={() => setDetailOrderTarget(null)}
                  style={[
                    styles.modalCloseBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text style={[styles.modalCloseText, { color: theme.colors.text }]}>×</Text>
                </Pressable>
              </View>
              <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}> 
                {detailOrderTarget?.order_number} full request snapshot for admin review.
              </Text>
              <View style={styles.historyRow}>
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Customer: {detailOrderTarget?.customer_name || "-"}</Text>
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Company: {detailOrderTarget?.company_name || "-"}</Text>
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Priority: {normalizeOrderPriorityValue(detailOrderTarget?.priority) === "high" ? "HIGH" : "STANDARD"}</Text>
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Submitted: {formatBackendDateTime(detailOrderTarget?.created_at)}</Text>
                {hasValue(detailOrderTarget?.sample_type) ? (
                  <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Sample Type: {formatDisplayCase(detailOrderTarget?.sample_type)}</Text>
                ) : null}
                {hasValue(detailOrderTarget?.compound_name) ? (
                  <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Compound Name: {formatDisplayCase(detailOrderTarget?.compound_name)}</Text>
                ) : null}
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Quantity: {formatQuantityText(detailOrderTarget?.quantity, detailOrderTarget?.unit, detailOrderTarget?.sample_count)}</Text>
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Equipment: {detailOrderTarget?.equipment_name || "Not assigned"}</Text>
                <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Technician: {detailOrderTarget?.assigned_technician_name || "Not assigned"}</Text>
                {hasValue(detailOrderTarget?.notes) ? (
                  <Text style={[styles.historyMeta, { color: theme.colors.text }]}>Notes: {detailOrderTarget?.notes}</Text>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(rejectOrderTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRejectOrderTarget(null);
          setRejectReason("");
        }}
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
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Reject Order</Text>
              <Pressable
                onPress={() => {
                  setRejectOrderTarget(null);
                  setRejectReason("");
                }}
                style={[
                  styles.modalCloseBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.modalCloseText, { color: theme.colors.text }]}>×</Text>
              </Pressable>
            </View>
            <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}> 
              {rejectOrderTarget?.order_number} will be marked as rejected. Add a reason the customer can see.
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder="Enter rejection reason"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.reasonInput,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                },
              ]}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setRejectOrderTarget(null);
                  setRejectReason("");
                }}
                style={[
                  styles.modalBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>

              <GradientButton
                onPress={() => {
                  if (!rejectOrderTarget) {
                    return;
                  }
                  void runReject(rejectOrderTarget, rejectReason.trim());
                }}
                disabled={
                  !rejectOrderTarget || !rejectReason.trim() || busyId === rejectOrderTarget.id
                }
                style={styles.modalBtn}
                colors={dangerGradient}
                compact
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {busyId === rejectOrderTarget?.id ? "Rejecting..." : "Reject Order"}
                </Text>
              </GradientButton>
            </View>
          </View>
        </View>
      </Modal>
      {confirm.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10 },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: { fontSize: 16, fontWeight: "800", marginTop: 3 },
  messageBox: { borderWidth: 1, borderRadius: 10, padding: 10 },
  messageText: { fontSize: 12, fontWeight: "800" },
  historyWrap: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  historyTitle: { fontSize: 14, fontWeight: "800" },
  historySub: { fontSize: 11, fontWeight: "700" },
  historyRow: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 3 },
  historyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  historyOrder: { fontSize: 13, fontWeight: "800", flex: 1 },
  historyDecision: { fontSize: 11, fontWeight: "900" },
  historyMeta: { fontSize: 11, fontWeight: "600" },
  sortRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 2 },
  sortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  sortChipText: { fontSize: 11, fontWeight: "800" },
  findingText: { fontSize: 11, fontWeight: "800", marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", flex: 1 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { fontSize: 20, fontWeight: "800", lineHeight: 22 },
  modalSub: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  reasonInput: {
    minHeight: 108,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalBtnText: { fontSize: 13, fontWeight: "800" },
  modalBtnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  listWrap: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 8 },
  listTitle: { fontSize: 15, fontWeight: "800" },
  listSub: { fontSize: 12, fontWeight: "700" },
  orderCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  orderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderNumber: { fontSize: 14, fontWeight: "800", flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  priorityBadge: {
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  newBadge: {
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kvKey: { fontSize: 11, fontWeight: "700" },
  kvValue: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: "62%",
    textAlign: "right",
  },
  notesBox: { borderTopWidth: 1, borderWidth: 1, borderRadius: 10, padding: 8, gap: 4, marginTop: 4 },
  notesLabel: { fontSize: 11, fontWeight: "800" },
  notesText: { fontSize: 12, lineHeight: 18, fontWeight: "600" },
  actionsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    alignItems: "stretch",
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 10,
    textAlign: "center",
    width: "100%",
  },
  refreshBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  refreshBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { fontSize: 12, fontWeight: "700", paddingVertical: 8 },
  errorText: { fontSize: 13, fontWeight: "700" },
});
