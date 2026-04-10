import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
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
  decidedAt: string;
};

export default function AdminApprovalsPage() {
  const theme = useAppTheme();
  const [orders, setOrders] = useState<PendingOrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [recentDecisions, setRecentDecisions] = useState<DecisionRecord[]>([]);
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();

  const pushDecision = (
    order: PendingOrderDto,
    decision: DecisionRecord["decision"],
  ) => {
    const record: DecisionRecord = {
      orderId: order.id,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      companyName: order.company_name,
      sampleCount: order.sample_count,
      priority: order.priority,
      decision,
      decidedAt: new Date().toLocaleString(),
    };

    setRecentDecisions((current) => [record, ...current].slice(0, 8));
  };

  const loadQueue = async () => {
    setLoading(true);
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

  useEffect(() => {
    loadQueue();

    const timer = setInterval(() => {
      loadQueue();
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const pending = orders.length;
    const high = orders.filter((item) => item.priority === "high").length;
    return { pending, high };
  }, [orders]);

  const runApprove = async (order: PendingOrderDto) => {
    setBusyId(order.id);
    try {
      await approveOrder(order.id);
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

  const runReject = async (order: PendingOrderDto) => {
    setBusyId(order.id);
    try {
      await rejectOrder(order.id, "Rejected via mobile admin app");
      await loadQueue();
      pushDecision(order, "rejected");
      setMessageText(
        `${order.order_number} rejected for ${order.customer_name} (${order.sample_count} sample(s), ${order.priority} priority).`,
      );
      feedback.showSuccess(
        "Order Rejected",
        `${order.order_number} was rejected and removed from the pending queue.`,
      );
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
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
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

        {recentDecisions.length > 0 ? (
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
              Recent Decisions
            </Text>
            <Text
              style={[styles.historySub, { color: theme.colors.textMuted }]}
            >
              Recently approved or rejected orders with their details
            </Text>
            {recentDecisions.map((item, index) => (
              <View
                key={`${item.orderId}-${item.decidedAt}-${index}`}
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
                    {item.orderNumber}
                  </Text>
                  <Text
                    style={[
                      styles.historyDecision,
                      {
                        color:
                          item.decision === "approved"
                            ? theme.colors.success
                            : theme.colors.danger,
                      },
                    ]}
                  >
                    {item.decision.toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyMeta,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Customer: {item.customerName} | Company:{" "}
                  {item.companyName || "-"}
                </Text>
                <Text
                  style={[
                    styles.historyMeta,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Samples: {item.sampleCount} | Priority:{" "}
                  {item.priority.toUpperCase()} | Order ID: {item.orderId}
                </Text>
                <Text
                  style={[
                    styles.historyMeta,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Decided: {item.decidedAt}
                </Text>
              </View>
            ))}
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
                    onPress={() =>
                      confirm.openConfirm({
                        title: "Reject Order",
                        message: `Reject ${order.order_number}?`,
                        confirmText: "Reject",
                        variant: "error",
                        onConfirm: () => runReject(order),
                      })
                    }
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
      </ScrollView>
      {feedback.modal}
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
