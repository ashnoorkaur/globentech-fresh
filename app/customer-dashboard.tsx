import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    fetchCustomerMyOrders,
    type CustomerOrderRow,
} from "../lib/orders-api";
import { useAppTheme } from "../lib/theme";

export default function CustomerDashboardPage() {
  const theme = useAppTheme();
  const [orders, setOrders] = useState<CustomerOrderRow[]>([]);
  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchCustomerMyOrders();
      setOrders(data);
    } catch {
      setOrders([]);
    }
  }, []);

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

        {orders.slice(0, 4).map((order) => (
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
              {(order.status || "pending").toUpperCase()} -{" "}
              {order.created_at
                ? new Date(order.created_at).toLocaleString()
                : "No date"}
            </Text>
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
});
