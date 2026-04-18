import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { hasCachedScreenState, useCachedScreenState } from "../hooks/use-screen-cache";
import {
  fetchAdminOrderHistory,
  fetchAdminUsers,
  fetchPendingOrders,
  resetPendingApprovalsClientCaches,
  type AdminOrderHistoryDto,
  type AdminUserDto,
  type PendingOrderDto,
} from "../lib/admin-api";
import { fetchCalendarData, type QueueEntry } from "../lib/calendar-api";
import { backendDateTimeValue, formatBackendDateTime } from "../lib/date-time";
import { useNotificationsState } from "../lib/notifications-store";
import { normalizeOrderStatusForCompare } from "../lib/order-status-normalize";
import {
  normalizeOrderPriorityValue,
  statusLabel,
  toLifecycleStatus,
} from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

const formatDateTime = (value?: string | null) => {
  return formatBackendDateTime(value, "Not available");
};

const formatStatus = (value?: string | null) => statusLabel(toLifecycleStatus(value));

const dashboardPendingFingerprint = (rows: PendingOrderDto[]) =>
  rows
    .map((r) =>
      [
        r.id,
        (r.order_number || "").trim().toUpperCase(),
        normalizeOrderPriorityValue(r.priority),
        String(r.status || "").trim().toLowerCase(),
      ].join("\t"),
    )
    .sort()
    .join("|");

const dashboardQueueFingerprint = (rows: QueueEntry[]) =>
  rows
    .map((q) =>
      [
        q.order_id,
        (q.order_number || "").trim().toUpperCase(),
        String(q.order_status || "").trim().toLowerCase(),
      ].join("\t"),
    )
    .sort()
    .join("|");

const dashboardUsersFingerprint = (rows: AdminUserDto[]) =>
  rows
    .map((u) => [u.id, u.role || "", u.is_active === false ? 0 : 1].join("\t"))
    .sort()
    .join("|");

const dashboardHistoryFingerprint = (rows: AdminOrderHistoryDto[]) =>
  rows
    .map((r) =>
      [
        r.id,
        (r.order_number || "").trim().toUpperCase(),
        String(r.status || "").trim().toLowerCase(),
        normalizeOrderPriorityValue(r.priority),
      ].join("\t"),
    )
    .sort()
    .join("|");

export default function AdminDashboardPage() {
  const theme = useAppTheme();
  const notifications = useNotificationsState();
  const [orders, setOrders] = useCachedScreenState<PendingOrderDto[]>(
    "admin-dashboard:orders:v5",
    [],
  );
  const [queue, setQueue] = useCachedScreenState<QueueEntry[]>(
    "admin-dashboard:queue",
    [],
  );
  const [historyRows, setHistoryRows] = useCachedScreenState<AdminOrderHistoryDto[]>(
    "admin-dashboard:historyRows",
    [],
  );
  const [users, setUsers] = useCachedScreenState<AdminUserDto[]>(
    "admin-dashboard:users",
    [],
  );
  const [equipmentCount, setEquipmentCount] = useCachedScreenState<number>(
    "admin-dashboard:equipmentCount",
    0,
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("admin-dashboard:orders:v5"),
  );
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-dashboard:lastUpdated:v2",
    "",
  );
  const [pendingSortMode, setPendingSortMode] = useState<
    "newest" | "oldest" | "priority_high" | "priority_standard"
  >("newest");

  const dashboardFetchOkRef = useRef(
    hasCachedScreenState("admin-dashboard:orders:v5"),
  );
  const lastDashboardFpRef = useRef({
    o: "",
    q: "",
    u: "",
    h: "",
    e: "",
  });

  const loadLiveData = useCallback(async () => {
    if (!dashboardFetchOkRef.current) {
      if (!hasCachedScreenState("admin-dashboard:orders:v5")) {
        setLoading(true);
      }
    } else {
      setSyncing(true);
    }
    try {
      resetPendingApprovalsClientCaches();

      const [pendingOrdersResult, adminUsersResult, calendarDataResult, historyResult] =
        await Promise.allSettled([
          fetchPendingOrders(),
          fetchAdminUsers(),
          fetchCalendarData(),
          fetchAdminOrderHistory(),
        ]);

      const pendingOrders =
        pendingOrdersResult.status === "fulfilled" ? pendingOrdersResult.value : [];

      const adminUsers = adminUsersResult.status === "fulfilled" ? adminUsersResult.value : [];

      const calendarData =
        calendarDataResult.status === "fulfilled"
          ? calendarDataResult.value
          : { queue: [], equipment: [] };

      const historyData = historyResult.status === "fulfilled" ? historyResult.value : [];

      const fpO = dashboardPendingFingerprint(pendingOrders);
      const fpQ = dashboardQueueFingerprint(calendarData.queue ?? []);
      const fpU = dashboardUsersFingerprint(adminUsers);
      const fpH = dashboardHistoryFingerprint(historyData);
      const fpE = String(calendarData.equipment?.length ?? 0);

      let changed = false;
      const prevFp = lastDashboardFpRef.current;

      if (!dashboardFetchOkRef.current) {
        setOrders(pendingOrders);
        setUsers(adminUsers);
        setQueue(calendarData.queue ?? []);
        setHistoryRows(historyData);
        setEquipmentCount(calendarData.equipment?.length ?? 0);
        lastDashboardFpRef.current = { o: fpO, q: fpQ, u: fpU, h: fpH, e: fpE };
        changed = true;
        dashboardFetchOkRef.current = true;
      } else {
        if (fpO !== prevFp.o) {
          lastDashboardFpRef.current.o = fpO;
          setOrders(pendingOrders);
          changed = true;
        }
        if (fpQ !== prevFp.q) {
          lastDashboardFpRef.current.q = fpQ;
          setQueue(calendarData.queue ?? []);
          changed = true;
        }
        if (fpU !== prevFp.u) {
          lastDashboardFpRef.current.u = fpU;
          setUsers(adminUsers);
          changed = true;
        }
        if (fpH !== prevFp.h) {
          lastDashboardFpRef.current.h = fpH;
          setHistoryRows(historyData);
          changed = true;
        }
        if (fpE !== prevFp.e) {
          lastDashboardFpRef.current.e = fpE;
          setEquipmentCount(Number(fpE));
          changed = true;
        }
      }

      if (changed) {
        queueMicrotask(() => setLastUpdated(new Date().toLocaleTimeString()));
      }
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [
    setEquipmentCount,
    setHistoryRows,
    setLastUpdated,
    setOrders,
    setQueue,
    setUsers,
  ]);

  useFocusedPolling(loadLiveData, {
    intervalMs: 0,
    minGapMs: 400,
    pollWhileFocused: false,
    subscribeToLiveData: false,
    reloadOnAppActive: false,
    runOnMount: true,
    runOnFocus: true,
  });

  const stats = useMemo(() => {
    const pendingCount = orders.length;
    const usersCount = users.length;

    const trackedKeys = new Set<string>();
    orders.forEach((order) => {
      trackedKeys.add((order.order_number || String(order.id)).trim().toUpperCase());
    });
    historyRows.forEach((row) => {
      trackedKeys.add((row.order_number || String(row.id)).trim().toUpperCase());
    });
    queue.forEach((item) => {
      trackedKeys.add((item.order_number || String(item.order_id)).trim().toUpperCase());
    });

    const completedKeys = new Set<string>();
    historyRows.forEach((row) => {
      if (normalizeOrderStatusForCompare(row.status) === "completed") {
        completedKeys.add((row.order_number || String(row.id)).trim().toUpperCase());
      }
    });

    return {
      pendingCount,
      equipmentCount,
      usersCount,
      trackedCount: trackedKeys.size,
      completedCount: completedKeys.size,
    };
  }, [equipmentCount, historyRows, orders, users, queue]);

  const recentNotifications = useMemo(
    () => notifications.items.slice(0, 3),
    [notifications.items],
  );

  const liveOrders = useMemo(() => {
    const merged = new Map<string, AdminOrderHistoryDto | PendingOrderDto>();

    historyRows.forEach((row) => {
      merged.set((row.order_number || String(row.id)).trim().toUpperCase(), row);
    });

    orders.forEach((row) => {
      const key = (row.order_number || String(row.id)).trim().toUpperCase();
      const previous = merged.get(key);
      merged.set(key, previous ? { ...previous, ...row } : row);
    });

    queue.forEach((item) => {
      const key = (item.order_number || String(item.order_id)).trim().toUpperCase();
      const previous = merged.get(key);
      const queueSampleCount = item.sample_types.filter(Boolean).length || (item.sample_type ? 1 : 0);

      if (previous) {
        merged.set(key, {
          ...previous,
          customer_name: previous.customer_name || item.customer_name || "Customer",
          company_name: previous.company_name || item.company_name,
          sample_type: previous.sample_type || item.sample_type,
          compound_name: previous.compound_name || item.compound_name,
          sample_count: previous.sample_count || queueSampleCount,
          quantity: previous.quantity ?? item.quantity,
          unit: previous.unit || item.unit,
          notes: previous.notes || item.notes,
          status: previous.status || item.order_status,
          estimated_completion: previous.estimated_completion || item.estimated_completion || undefined,
          equipment_id: previous.equipment_id ?? item.equipment_id,
          equipment_name: previous.equipment_name || item.equipment_name || undefined,
          scheduled_start: previous.scheduled_start || item.scheduled_start || undefined,
          scheduled_end: previous.scheduled_end || item.scheduled_end || undefined,
          assigned_at: previous.assigned_at || item.assigned_at || undefined,
          assigned_technician_uid:
            previous.assigned_technician_uid || item.assigned_technician_uid,
          assigned_technician_name:
            previous.assigned_technician_name || item.assigned_technician_name,
          assigned_technician_email:
            previous.assigned_technician_email || item.assigned_technician_email,
          technician_status_action:
            previous.technician_status_action || item.technician_status_action,
          technician_status_note:
            previous.technician_status_note || item.technician_status_note,
          technician_status_updated_at:
            previous.technician_status_updated_at || item.technician_status_updated_at,
          technician_status_updated_by:
            previous.technician_status_updated_by || item.technician_status_updated_by,
        });
      } else {
        merged.set(key, {
          id: item.order_id,
          order_number: item.order_number,
          customer_name: item.customer_name || "Customer",
          company_name: item.company_name,
          created_at:
            item.assigned_at || item.scheduled_start || item.estimated_completion || "",
          priority: normalizeOrderPriorityValue(item.priority),
          sample_count: queueSampleCount,
          status: item.order_status,
          sample_type: item.sample_type,
          compound_name: item.compound_name,
          quantity: item.quantity,
          unit: item.unit,
          notes: item.notes,
          estimated_completion: item.estimated_completion || undefined,
          equipment_id: item.equipment_id ?? undefined,
          equipment_name: item.equipment_name || undefined,
          scheduled_start: item.scheduled_start || undefined,
          scheduled_end: item.scheduled_end || undefined,
          assigned_at: item.assigned_at || undefined,
          assigned_technician_uid: item.assigned_technician_uid || undefined,
          assigned_technician_name: item.assigned_technician_name || undefined,
          assigned_technician_email: item.assigned_technician_email || undefined,
          technician_status_action: item.technician_status_action || undefined,
          technician_status_note: item.technician_status_note || undefined,
          technician_status_updated_at: item.technician_status_updated_at || undefined,
          technician_status_updated_by: item.technician_status_updated_by || undefined,
        });
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const aTime = backendDateTimeValue(a.created_at);
      const bTime = backendDateTimeValue(b.created_at);
      return bTime - aTime;
    });
  }, [historyRows, orders, queue]);

  const sortedPendingApprovals = useMemo(() => {
    const next = [...orders];
    next.sort((a, b) => {
      if (pendingSortMode === "priority_high") {
        const ah = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
        const bh = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
        if (ah !== bh) return bh - ah;
      }
      if (pendingSortMode === "priority_standard") {
        const ah = normalizeOrderPriorityValue(a.priority) === "high" ? 1 : 0;
        const bh = normalizeOrderPriorityValue(b.priority) === "high" ? 1 : 0;
        if (ah !== bh) return ah - bh;
      }
      const at = backendDateTimeValue(a.created_at);
      const bt = backendDateTimeValue(b.created_at);
      if (pendingSortMode === "oldest") return at - bt;
      return bt - at;
    });
    return next;
  }, [orders, pendingSortMode]);

  const latestLiveOrders = liveOrders.slice(0, 1);

  const metricsPlaceholder = loading && orders.length === 0 && queue.length === 0 && users.length === 0;

  const cards = [
    {
      title: "Pending Approvals",
      description: "Orders waiting for approval",
      metricLabel: "Pending",
      metricValue: metricsPlaceholder ? "--" : String(stats.pendingCount),
      route: "/admin-approvals" as const,
      button: "Review Orders",
      color: theme.colors.primary,
    },
    {
      title: "Orders & Timeline",
      description: "View active order detail and live queue state",
      metricLabel: "Tracked",
      metricValue: metricsPlaceholder ? "--" : String(stats.trackedCount),
      route: "/admin-order-history" as const,
      button: "Open Timeline",
      color: theme.colors.warning,
    },
    {
      title: "User Management",
      description: "Manage user accounts and permissions",
      metricLabel: "Users",
      metricValue: metricsPlaceholder ? "--" : String(stats.usersCount),
      route: "/admin-users" as const,
      button: "Manage Users",
      color: theme.colors.secondary,
    },
    {
      title: "Equipment Management",
      description: "Configure equipment settings and schedules",
      metricLabel: "Equipment",
      metricValue: metricsPlaceholder ? "--" : String(stats.equipmentCount),
      route: "/admin-equipment" as const,
      button: "Manage Equipment",
      color: theme.colors.buttonStart,
    },
    {
      title: "Reports & Analytics",
      description: "View system statistics and performance",
      metricLabel: "Completed",
      metricValue: metricsPlaceholder ? "--" : String(stats.completedCount),
      route: "/admin-reports" as const,
      button: "View Reports",
      color: theme.colors.info,
    },
  ];

  return (
    <RoleContentPage
      title="Dashboard"
      subtitle="Live operational overview with real-time order updates."
      activeKey="dashboard"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
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
            styles.liveBanner,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.liveBannerTitle, { color: theme.colors.text }]}>
            Operations Snapshot
          </Text>
          <View style={styles.liveBannerMetaRow}>
            <Text style={[styles.liveBannerSub, { color: theme.colors.textMuted, flex: 1 }]}>
              Updated {lastUpdated || "--"} ·{" "}
              {loading ? "Loading..." : syncing ? "Syncing..." : "Ready"}
            </Text>
            <Pressable
              onPress={loadLiveData}
              disabled={loading || syncing}
              hitSlop={10}
              style={styles.liveBannerRefreshWrap}
            >
              <Text style={[styles.liveBannerRefresh, { color: theme.colors.primary }]}>
                {loading || syncing ? "Wait..." : "Refresh"}
              </Text>
            </Pressable>
          </View>
        </View>

        {cards.map((card) => (
          <View
            key={card.title}
            style={[
              styles.featureCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.featureTitle, { color: theme.colors.text }]}>
              {card.title}
            </Text>
            <Text
              style={[styles.featureDesc, { color: theme.colors.textMuted }]}
            >
              {card.description}
            </Text>
            <View style={styles.featureStatRow}>
              <Text
                style={[
                  styles.featureStatLabel,
                  { color: theme.colors.textMuted },
                ]}
              >
                {card.metricLabel}
              </Text>
              <Text style={[styles.featureStatValue, { color: card.color }]}>
                {card.metricValue}
              </Text>
            </View>
            <GradientButton
              style={styles.featureBtn}
              onPress={() => router.push(card.route)}
              colors={["#4F7CFF", "#8C5BEA"]}
              compact
            >
              <Text style={styles.featureBtnText}>{card.button}</Text>
            </GradientButton>
          </View>
        ))}

        <View
          style={[
            styles.ordersPanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.ordersPanelTitle, { color: theme.colors.text }]}>
            Pending approvals queue
          </Text>
          <Text style={[styles.ordersPanelSub, { color: theme.colors.textMuted }]}>
            Every order waiting for admin review ({orders.length}). Sort here, then open the approvals screen to act on them.
          </Text>
          <View style={styles.sortRow}>
            {(
              [
                ["newest", "Newest"],
                ["oldest", "Oldest"],
                ["priority_high", "High first"],
                ["priority_standard", "Standard first"],
              ] as const
            ).map(([value, label]) => {
              const active = pendingSortMode === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setPendingSortMode(value)}
                  style={[
                    styles.sortChip,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
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
          {sortedPendingApprovals.length === 0 ? (
            <Text style={[styles.notificationsEmpty, { color: theme.colors.textMuted }]}>
              No pending approval orders right now.
            </Text>
          ) : (
            <ScrollView style={styles.pendingScroll} nestedScrollEnabled>
              {sortedPendingApprovals.map((order) => {
                const isHigh = normalizeOrderPriorityValue(order.priority) === "high";
                return (
                  <Pressable
                    key={`pending-${order.id}-${order.order_number}`}
                    onPress={() => router.push("/admin-approvals")}
                    style={[
                      styles.pendingRow,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.pendingRowTop}>
                      <Text style={[styles.orderTitle, { color: theme.colors.text }]}>
                        {order.order_number}
                      </Text>
                      <Text
                        style={[
                          styles.priorityPill,
                          {
                            color: isHigh ? theme.colors.danger : theme.colors.warning,
                            backgroundColor: isHigh
                              ? theme.colors.danger + "20"
                              : theme.colors.warning + "20",
                          },
                        ]}
                      >
                        {isHigh ? "HIGH" : "STANDARD"}
                      </Text>
                    </View>
                    <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
                      {order.customer_name || "Customer"} · {formatDateTime(order.created_at)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={() => router.push("/admin-approvals")}>
            <Text style={[styles.orderAlert, { color: theme.colors.primary, marginTop: 8 }]}>
              Open pending approvals
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.ordersPanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.ordersPanelTitle, { color: theme.colors.text }]}>Live Order Details</Text>
          <Text style={[styles.ordersPanelSub, { color: theme.colors.textMuted }]}>Showing the most recent live order. Tap it to open the full order list page.</Text>
          {latestLiveOrders.length === 0 ? (
            <Text style={[styles.notificationsEmpty, { color: theme.colors.textMuted }]}>No live orders available right now.</Text>
          ) : (
            latestLiveOrders.map((order) => (
              <Pressable
                key={`${order.id}-${order.order_number}`}
                onPress={() => router.push("/admin-order-history")}
                style={[
                  styles.orderRow,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text style={[styles.orderTitle, { color: theme.colors.text }]}>
                  {order.order_number}
                </Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
                  Status: {formatStatus(order.status)} | Priority:{" "}
                  {normalizeOrderPriorityValue(order.priority) === "high" ? "HIGH" : "STANDARD"}
                </Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
                  Customer: {order.customer_name || "N/A"} | Company: {order.company_name || "N/A"}
                </Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
                  Samples: {order.sample_count ?? 0}
                  {order.compound_name ? ` | Compound: ${order.compound_name}` : ""}
                </Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
                  Technician: {order.assigned_technician_name || "Awaiting assignment"} | Equipment: {order.equipment_name || "Pending"}
                </Text>
                <Text style={[styles.orderSub, { color: theme.colors.textMuted }]}>
                  Created: {formatDateTime(order.created_at)} | ETA: {formatDateTime(order.estimated_completion || order.scheduled_end)}
                </Text>
                <Text style={[styles.orderAlert, { color: theme.colors.primary }]}>
                  Open full order list
                </Text>
                {order.rejection_reason ? (
                  <Text style={[styles.orderAlert, { color: theme.colors.danger }]}>
                    Rejection Reason: {order.rejection_reason}
                  </Text>
                ) : null}
              </Pressable>
            ))
          )}
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
            <Text
              style={[styles.notificationsLink, { color: theme.colors.primary }]}
              onPress={() => router.push("/notifications")}
            >
              Open All
            </Text>
          </View>
          {recentNotifications.length === 0 ? (
            <Text style={[styles.notificationsEmpty, { color: theme.colors.textMuted }]}>No recent admin notifications.</Text>
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
  liveBanner: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  liveBannerTitle: { fontSize: 14, fontWeight: "800" },
  liveBannerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  liveBannerSub: { fontSize: 12, fontWeight: "700" },
  liveBannerRefreshWrap: { paddingVertical: 2, paddingHorizontal: 4 },
  liveBannerRefresh: { fontSize: 12, fontWeight: "800" },
  featureCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  featureTitle: { fontSize: 15, fontWeight: "800" },
  featureDesc: { fontSize: 12 },
  featureStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featureStatLabel: { fontSize: 12, fontWeight: "700" },
  featureStatValue: { fontSize: 18, fontWeight: "800" },
  featureBtn: {
    marginTop: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    minWidth: 140,
  },
  featureBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  ordersPanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  ordersPanelTitle: { fontSize: 15, fontWeight: "800" },
  ordersPanelSub: { fontSize: 12, lineHeight: 18 },
  sortRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 2 },
  sortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  sortChipText: { fontSize: 11, fontWeight: "800" },
  pendingScroll: { maxHeight: 220 },
  pendingRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4, marginBottom: 8 },
  pendingRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  priorityPill: { fontSize: 10, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  orderRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  orderTitle: { fontSize: 13, fontWeight: "800" },
  orderSub: { fontSize: 11, lineHeight: 17 },
  orderAlert: { fontSize: 11, lineHeight: 17, fontWeight: "700" },
  notificationsPanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notificationsTitle: { fontSize: 15, fontWeight: "800" },
  notificationsLink: { fontSize: 12, fontWeight: "800" },
  notificationsEmpty: { fontSize: 12, fontWeight: "700" },
  notificationRow: { gap: 2 },
  notificationTitle: { fontSize: 12, fontWeight: "800" },
  notificationMessage: { fontSize: 11, lineHeight: 17 },
});
