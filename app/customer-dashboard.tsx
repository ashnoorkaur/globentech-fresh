import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import { useNotificationsState } from "../lib/notifications-store";
import {
    fetchCustomerMyOrders,
    type CustomerOrderRow,
} from "../lib/orders-api";
import { useAppTheme } from "../lib/theme";

const formatDateTime = (value?: string) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const formatStatus = (value?: string) => {
  const normalized = (value || "pending").replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export default function CustomerDashboardPage() {
  const theme = useAppTheme();
  const notifications = useNotificationsState();
  const [orders, setOrders] = useCachedScreenState<CustomerOrderRow[]>(
    "customer-dashboard:orders",
    [],
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("customer-dashboard:orders"),
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "customer-dashboard:lastUpdated",
    "",
  );
  
  const loadOrders = useCallback(async () => {
    if (orders.length === 0) {
      setLoading(true);
    }
    try {
      const data = await fetchCustomerMyOrders();
      setOrders(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
    }
  }, [orders.length, setLastUpdated, setOrders]);

  useFocusedPolling(loadOrders, { intervalMs: 20000 });

  const stats = useMemo(() => {
    const total = orders.length;
    const inProgress = orders.filter((o) => {
      const status = (o.status || "").toLowerCase();
      return (
        status === "pending" || status === "approved" || status === "processing"
      );
    }).length;
    const completed = orders.filter(
      (o) => (o.status || "").toLowerCase() === "completed",
    ).length;
    return { total, inProgress, completed };
  }, [orders]);

  const recentNotifications = useMemo(
    () => notifications.items.slice(0, 3),
    [notifications.items],
  );

  return (
    <RoleContentPage
      title="Dashboard"
      subtitle="Track your live order flow and recent activity."
      activeKey="dashboard"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
      role="Customer"
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
        <View style={styles.statRow}>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Total Orders
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {stats.total}
            </Text>
          </View>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              In Progress
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.secondary }]}>
              {stats.inProgress}
            </Text>
          </View>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Completed
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>
              {stats.completed}
            </Text>
          </View>
        </View>

        {orders.slice(0, 3).map((order) => (
          <View
            key={order.id}
            style={[
              styles.orderRow,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.orderTitle, { color: theme.colors.text }]}>
              {order.order_number || `ORD-${order.id}`}
            </Text>
            <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
              {formatStatus(order.status)} · Created {formatDateTime(order.created_at)}
            </Text>
            <Text style={[styles.orderMeta, { color: theme.colors.textMuted }]}>
              Company: {order.company_name || "N/A"}
            </Text>
            <Text style={[styles.orderMeta, { color: theme.colors.textMuted }]}>
              Sample: {order.sample_type || "N/A"} | Compound: {order.compound_name || "N/A"}
            </Text>
            <Text style={[styles.orderMeta, { color: theme.colors.textMuted }]}>
              Quantity: {order.quantity ?? "N/A"} {order.unit || ""} | ETA: {formatDateTime(order.estimated_completion)}
            </Text>
            <Text style={[styles.orderMeta, { color: theme.colors.textMuted }]}>
              Technician: {order.assigned_technician_name || "Awaiting assignment"} | Equipment: {order.equipment_name || "Pending"}
            </Text>
            <Text style={[styles.orderMeta, { color: theme.colors.textMuted }]}>
              Start: {formatDateTime(order.scheduled_start)} | End: {formatDateTime(order.scheduled_end)}
            </Text>
            {order.notes ? (
              <Text style={[styles.orderMeta, { color: theme.colors.text }]}>
                Notes: {order.notes}
              </Text>
            ) : null}
            {order.technician_status_note ? (
              <Text style={[styles.orderMeta, { color: theme.colors.primary }]}> 
                Latest Technician Update: {order.technician_status_note}
              </Text>
            ) : null}
            {order.rejection_reason ? (
              <Text style={[styles.orderAlert, { color: theme.colors.danger }]}> 
                Rejection Reason: {order.rejection_reason}
              </Text>
            ) : null}
          </View>
        ))}

        <View
          style={[
            styles.summaryRow,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <View style={styles.summaryBlock}>
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Pending Now
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.warning }]}
            >
              {stats.inProgress}
            </Text>
          </View>
          <View
            style={[
              styles.summaryDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />
          <View style={styles.summaryBlock}>
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Latest Order
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.primary }]}
              numberOfLines={1}
            >
              {orders[0]?.order_number || "-"}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => router.push("/customer-new-order")}
          >
            <Text style={styles.actionBtnText}>New Order</Text>
          </Pressable>
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.secondary },
            ]}
            onPress={() => router.push("/customer-my-orders")}
          >
            <Text style={styles.actionBtnText}>My Orders</Text>
          </Pressable>
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.buttonStart },
            ]}
            onPress={loadOrders}
          >
            <Text style={styles.actionBtnText}>Refresh</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.notificationsPanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <View style={styles.notificationsHeader}>
            <Text style={[styles.notificationsTitle, { color: theme.colors.text }]}>Recent Notifications</Text>
            <Pressable onPress={() => router.push("/notifications")}>
              <Text style={[styles.notificationsLink, { color: theme.colors.primary }]}>Open All</Text>
            </Pressable>
          </View>
          {recentNotifications.length === 0 ? (
            <Text style={[styles.notificationsEmpty, { color: theme.colors.textMuted }]}>No recent customer notifications.</Text>
          ) : (
            recentNotifications.map((item) => (
              <View key={item.id} style={styles.notificationRow}>
                <Text style={[styles.notificationTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.notificationMessage, { color: theme.colors.textMuted }]}>{item.message}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10 },
  statLabel: { fontSize: 11, fontWeight: "700" },
  statValue: { fontSize: 20, fontWeight: "800", marginTop: 3 },
  orderRow: { borderWidth: 1, borderRadius: 12, padding: 10 },
  orderTitle: { fontSize: 14, fontWeight: "800" },
  orderSub: { fontSize: 12, marginTop: 2 },
  orderMeta: { fontSize: 12, marginTop: 3, lineHeight: 18 },
  orderAlert: { fontSize: 12, marginTop: 4, lineHeight: 18, fontWeight: "700" },
  summaryRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  summaryBlock: { flex: 1, gap: 2 },
  summaryDivider: { width: 1, alignSelf: "stretch", marginHorizontal: 10 },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: { fontSize: 14, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  notificationsPanel: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notificationsTitle: { fontSize: 13, fontWeight: "800" },
  notificationsLink: { fontSize: 12, fontWeight: "800" },
  notificationsEmpty: { fontSize: 12, fontWeight: "700" },
  notificationRow: { gap: 2 },
  notificationTitle: { fontSize: 12, fontWeight: "800" },
  notificationMessage: { fontSize: 11, lineHeight: 17 },
});
