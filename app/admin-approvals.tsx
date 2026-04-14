import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import {
    approveOrder,
    fetchPendingOrders,
    rejectOrder,
    type PendingOrderDto,
} from "../lib/admin-api";
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

export default function AdminApprovalsPage() {
  const theme = useAppTheme();
  const [orders, setOrders] = useCachedScreenState<PendingOrderDto[]>(
    "admin-approvals:orders",
    [],
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("admin-approvals:orders"),
  );
  const [errorText, setErrorText] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-approvals:lastUpdated",
    "",
  );
  const [recentDecisions, setRecentDecisions] = useCachedScreenState<DecisionRecord[]>(
    "admin-approvals:recentDecisions",
    [],
  );
  const [rejectOrderTarget, setRejectOrderTarget] = useState<PendingOrderDto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
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
      priority: order.priority,
      decision,
      rejectionReason,
      decidedAt: new Date().toLocaleString(),
    };

    setRecentDecisions([record]);
  };

  const latestDecision = recentDecisions[0];

  const loadQueue = async () => {
    if (orders.length === 0) {
      setLoading(true);
    }
    setErrorText("");
    try {
      const pending = await fetchPendingOrders();
      setOrders(pending);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : "Failed to load pending approvals.",
      );
    } finally {
      setLoading(false);
    }
  };

  useFocusedPolling(loadQueue, { intervalMs: 10000, minGapMs: 250 });

  const stats = useMemo(() => {
    const pending = orders.length;
    const high = orders.filter((item) => item.priority === "high").length;
    return { pending, high };
  }, [orders]);

  const runApprove = async (order: PendingOrderDto) => {
    setBusyId(order.id);
    try {
      await approveOrder(order);
      await loadQueue();
      pushDecision(order, "approved");
      setMessageText(
        `${order.order_number} approved for ${order.customer_name} (${order.sample_count} sample(s), ${order.priority} priority).`,
      );
      feedback.showSuccess(
        "Order Approved",
        `${order.order_number} approved. Customer and technician views will show this order in the accepted flow.`,
      );
    } catch (error) {
      feedback.showError(
        "Approval Failed",
        error instanceof Error ? error.message : "Unable to approve order.",
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
      feedback.showError(
        "Rejection Failed",
        error instanceof Error ? error.message : "Unable to reject order.",
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
        <View style={styles.summaryRow}>
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
              High Priority
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
            Mobile list view with fast actions
          </Text>

          {orders.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              No pending orders
            </Text>
          ) : (
            orders.map((order) => (
              <View
                key={order.id}
                style={[
                  styles.orderCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <View style={styles.orderTopRow}>
                  <Text
                    style={[styles.orderNumber, { color: theme.colors.text }]}
                  >
                    {order.order_number}
                  </Text>
                  <Text
                    style={[
                      styles.priorityBadge,
                      {
                        color:
                          order.priority === "high"
                            ? theme.colors.danger
                            : theme.colors.warning,
                        backgroundColor:
                          order.priority === "high"
                            ? theme.colors.danger + "20"
                            : theme.colors.warning + "20",
                      },
                    ]}
                  >
                    {order.priority.toUpperCase()}
                  </Text>
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
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Submitted
                  </Text>
                  <Text
                    style={[styles.kvValue, { color: theme.colors.textMuted }]}
                  >
                    {new Date(order.created_at).toLocaleDateString()}{" "}
                    {new Date(order.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Samples
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {order.sample_count}
                  </Text>
                </View>

                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Sample Type
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {order.sample_type || "-"}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Compound
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {order.compound_name || "-"}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text
                    style={[styles.kvKey, { color: theme.colors.textMuted }]}
                  >
                    Quantity
                  </Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                    {order.quantity ?? "-"} {order.unit || ""}
                  </Text>
                </View>
                {order.estimated_completion ? (
                  <View style={styles.kvRow}>
                    <Text
                      style={[styles.kvKey, { color: theme.colors.textMuted }]}
                    >
                      ETA
                    </Text>
                    <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                      {new Date(order.estimated_completion).toLocaleString()}
                    </Text>
                  </View>
                ) : null}
                {order.notes ? (
                  <View style={styles.notesBox}>
                    <Text style={[styles.notesLabel, { color: theme.colors.textMuted }]}>Customer Notes</Text>
                    <Text style={[styles.notesText, { color: theme.colors.text }]}>
                      {order.notes}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.actionsRow}>
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
                    <Text style={styles.actionBtnText}>Approve</Text>
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
                    <Text style={styles.actionBtnText}>Reject</Text>
                  </GradientButton>
                </View>
              </View>
            ))
          )}
        </View>

        <GradientButton
          onPress={loadQueue}
          style={styles.refreshBtn}
          colors={actionGradient}
          compact
        >
          <Text style={styles.refreshBtnText}>
            {loading ? "Loading..." : "Refresh"}
          </Text>
        </GradientButton>
      </View>
      {feedback.modal}
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
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Reject Order</Text>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
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
  orderCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  orderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderNumber: { fontSize: 14, fontWeight: "800", flex: 1 },
  priorityBadge: {
    fontSize: 10,
    fontWeight: "800",
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
  notesBox: { borderTopWidth: 1, paddingTop: 8, gap: 4, marginTop: 4 },
  notesLabel: { fontSize: 11, fontWeight: "800" },
  notesText: { fontSize: 12, lineHeight: 18, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  refreshBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  refreshBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { fontSize: 12, fontWeight: "700", paddingVertical: 8 },
  errorText: { fontSize: 13, fontWeight: "700" },
});
