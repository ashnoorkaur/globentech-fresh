import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { useCachedScreenState } from "../hooks/use-screen-cache";
import { fetchAdminQueries, type ContactSubmission } from "../lib/contact-api-enhanced";
import { formatBackendDateTime } from "../lib/date-time";
import { useAppTheme } from "../lib/theme";

export default function AdminQueriesPage() {
  const theme = useAppTheme();
  const [queries, setQueries] = useCachedScreenState<ContactSubmission[]>(
    "admin-queries:list:v1",
    [],
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-queries:lastUpdated:v1",
    "",
  );

  const loadQueries = useCallback(async () => {
    try {
      const rows = await fetchAdminQueries();
      setQueries(rows);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep last successful snapshot visible.
    }
  }, [setLastUpdated, setQueries]);

  useFocusedPolling(loadQueries, { intervalMs: 12000 });

  const stats = useMemo(() => {
    const orderLinked = queries.filter((item) => Boolean(item.order_number?.trim())).length;
    const general = Math.max(queries.length - orderLinked, 0);
    return { total: queries.length, orderLinked, general };
  }, [queries]);

  return (
    <RoleContentPage
      title="Queries"
      subtitle="Customer contact submissions and support requests."
      activeKey="queries"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
    >
      <View style={styles.container}>
        <View
          style={[
            styles.liveStrip,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <Text style={[styles.liveStripTitle, { color: theme.colors.text }]}>Customer Queries</Text>
          <View style={styles.liveStripMeta}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.liveStripSub, { color: theme.colors.textMuted }]}>Updated {lastUpdated || "--"}</Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }]}>
            <Text style={[styles.chipText, { color: theme.colors.text }]}>Total {stats.total}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: theme.colors.primarySoft }]}>
            <Text style={[styles.chipText, { color: theme.colors.primary }]}>Order linked {stats.orderLinked}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: theme.colors.info + "22" }]}>
            <Text style={[styles.chipText, { color: theme.colors.info }]}>General {stats.general}</Text>
          </View>
        </View>

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
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Support Inbox</Text>
              <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>All customer-submitted questions are shown here in the same admin style as the rest of the app.</Text>
            </View>
            <Pressable
              onPress={loadQueries}
              style={[styles.refreshBtn, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>

          {queries.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Ionicons name="mail-open-outline" size={24} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No queries yet</Text>
              <Text style={[styles.emptySub, { color: theme.colors.textMuted }]}>When a customer submits the contact form, it will appear here for admin review.</Text>
            </View>
          ) : (
            queries.map((item, index) => (
              <View
                key={`${item.created_at || "query"}-${item.email || index}-${index}`}
                style={[
                  styles.queryCard,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.queryHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.queryTitle, { color: theme.colors.text }]}>
                      {item.name || "Customer"}
                    </Text>
                    <Text style={[styles.queryTime, { color: theme.colors.textMuted }]}>Submitted: {formatBackendDateTime(item.created_at, "Not available")}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: item.order_number ? theme.colors.primarySoft : theme.colors.info + "22" }]}>
                    <Text style={[styles.badgeText, { color: item.order_number ? theme.colors.primary : theme.colors.info }]}>
                      {item.order_number ? "Order Query" : "General"}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaBlock}>
                  <Text style={[styles.queryMeta, { color: theme.colors.textMuted }]}>Email: {item.email || "Not provided"}</Text>
                  {item.order_number ? (
                    <Text style={[styles.queryMeta, { color: theme.colors.textMuted }]}>Order: {item.order_number}</Text>
                  ) : null}
                </View>

                <View style={[styles.subjectBox, { backgroundColor: theme.colors.primarySoft }]}> 
                  <Text style={[styles.querySubject, { color: theme.colors.primary }]}>{item.subject || "General query"}</Text>
                </View>

                <Text style={[styles.queryMessage, { color: theme.colors.text }]}>{item.message || "No message provided."}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingBottom: 8 },
  liveStrip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  liveStripTitle: { fontSize: 15, fontWeight: "800" },
  liveStripMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveStripSub: { fontSize: 12, fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  refreshBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  sectionSub: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: "800" },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptySub: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  queryCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  queryHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  queryTitle: { fontSize: 15, fontWeight: "800" },
  queryTime: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  metaBlock: { gap: 2 },
  queryMeta: { fontSize: 12, lineHeight: 18 },
  subjectBox: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  querySubject: { fontSize: 12, fontWeight: "800" },
  queryMessage: { fontSize: 13, lineHeight: 20, fontWeight: "600" },
});