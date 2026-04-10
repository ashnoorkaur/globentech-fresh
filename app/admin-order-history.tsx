import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { fetchCalendarData, type QueueEntry } from "../lib/calendar-api";
import { useAppTheme } from "../lib/theme";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

type NormalizedStage =
  | "submitted"
  | "approved"
  | "processing"
  | "completed"
  | "rejected";

const normalizeStage = (value?: string | null): NormalizedStage => {
  const s = (value || "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("complete") || s.includes("result")) return "completed";
  if (s.includes("process") || s.includes("test") || s.includes("prep")) {
    return "processing";
  }
  if (s.includes("approve") || s.includes("queue")) return "approved";
  return "submitted";
};

const stageMeaning = (stage: NormalizedStage) => {
  if (stage === "submitted") return "Waiting for admin review.";
  if (stage === "approved") return "Approved and queued.";
  if (stage === "processing") return "Technician is handling the order.";
  if (stage === "completed") return "Finished and results are available.";
  return "Order was rejected.";
};

const stageStep = (stage: NormalizedStage) => {
  if (stage === "submitted") return 1;
  if (stage === "approved") return 2;
  if (stage === "processing") return 3;
  if (stage === "completed") return 4;
  return 0;
};

export default function AdminOrderHistoryPage() {
  const theme = useAppTheme();
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "processing" | "pending" | "approved" | "rejected"
  >("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<
    "all" | "completed" | "processing" | "pending" | "approved" | "rejected"
  >("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    const load = () => {
      fetchCalendarData()
        .then((result) => {
          setRows(result.queue ?? []);
          setLastUpdated(new Date().toLocaleTimeString());
        })
        .catch(() => setRows([]));
    };

    load();
    const timer = setInterval(load, 12000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const normalizedStatus = normalizeStage(row.order_status);

      if (statusFilter !== "all") {
        if (statusFilter === "pending" && normalizedStatus !== "submitted") {
          return false;
        }
        if (statusFilter !== "pending" && normalizedStatus !== statusFilter) {
          return false;
        }
      }

      const q = search.trim().toLowerCase();
      const bySearch = q
        ? [
            row.order_number,
            row.order_status,
            row.equipment_name || "",
            row.priority || "",
            row.queue_type || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        : true;

      const completedAt = row.estimated_completion || row.scheduled_end || "";
      const byFrom = fromDate.trim() ? completedAt >= fromDate.trim() : true;
      const byTo = toDate.trim()
        ? completedAt <= `${toDate.trim()} 23:59:59`
        : true;

      return bySearch && byFrom && byTo;
    });
  }, [rows, search, fromDate, toDate, statusFilter]);

  const clearFilters = () => {
    setSearch("");
    setFromDate("");
    setToDate("");
    setDraftStatusFilter("all");
    setStatusFilter("all");
  };

  const summary = useMemo(() => {
    const submitted = rows.filter(
      (r) => normalizeStage(r.order_status) === "submitted",
    ).length;
    const approved = rows.filter(
      (r) => normalizeStage(r.order_status) === "approved",
    ).length;
    const processing = rows.filter(
      (r) => normalizeStage(r.order_status) === "processing",
    ).length;
    const completed = rows.filter(
      (r) => normalizeStage(r.order_status) === "completed",
    ).length;
    const rejected = rows.filter(
      (r) => normalizeStage(r.order_status) === "rejected",
    ).length;
    return { submitted, approved, processing, completed, rejected };
  }, [rows]);

  const actionGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];
  const mutedGradient: [string, string] = ["#64748B", "#94A3B8"];

  return (
    <RoleContentPage
      title="Order History & Calendar"
      subtitle="All completed orders"
      role="Admin"
      activeKey="order-history"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Submitted
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.primary }]}
            >
              {summary.submitted}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Approved
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.secondary }]}
            >
              {summary.approved}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Processing
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.warning }]}
            >
              {summary.processing}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Completed
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.colors.success }]}
            >
              {summary.completed}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[styles.summaryLabel, { color: theme.colors.textMuted }]}
            >
              Rejected
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.danger }]}>
              {summary.rejected}
            </Text>
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
          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>
            Updated {lastUpdated || "--"}
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search order, status, priority, equipment"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
              },
            ]}
          />
          <View style={styles.rowInputs}>
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="From date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.inputHalf,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
            />
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="To date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.inputHalf,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
            />
          </View>
          <View style={styles.actions}>
            <View style={styles.statusWrap}>
              <Pressable
                style={[
                  styles.statusBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
                onPress={() => setStatusOpen((v) => !v)}
              >
                <Text
                  style={[styles.statusBtnText, { color: theme.colors.text }]}
                >
                  Status: {draftStatusFilter.toUpperCase()}
                </Text>
                <Ionicons
                  name={statusOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.colors.textMuted}
                />
              </Pressable>
              {statusOpen ? (
                <View
                  style={[
                    styles.statusDropdown,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {(
                    [
                      "all",
                      "completed",
                      "processing",
                      "pending",
                      "approved",
                      "rejected",
                    ] as const
                  ).map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setDraftStatusFilter(value);
                        setStatusOpen(false);
                      }}
                      style={[
                        styles.statusItem,
                        {
                          backgroundColor:
                            draftStatusFilter === value
                              ? theme.colors.primarySoft
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusItemText,
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
            <GradientButton
              style={styles.btn}
              onPress={() => setStatusFilter(draftStatusFilter)}
              colors={actionGradient}
              compact
            >
              <Text style={styles.btnText}>Apply</Text>
            </GradientButton>
            <GradientButton
              style={styles.btn}
              onPress={clearFilters}
              colors={mutedGradient}
              compact
            >
              <Text style={styles.btnText}>Clear</Text>
            </GradientButton>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Order Calendar
          </Text>
          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>
            Live list optimized for mobile viewing
          </Text>
          <View
            style={[
              styles.guideWrap,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text style={[styles.guideTitle, { color: theme.colors.text }]}>
              Stage Guide
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}>
              Submitted: waiting for admin review
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}>
              Approved: accepted and queued
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}>
              Processing: technician is working on it
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}>
              Completed: results are ready
            </Text>
          </View>

          {filtered.slice(0, 20).map((row) => (
            <View
              key={row.queue_id}
              style={[
                styles.orderCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              {(() => {
                const stage = normalizeStage(row.order_status);
                const step = stageStep(stage);
                const labels = [
                  "Submitted",
                  "Approved",
                  "Processing",
                  "Completed",
                ] as const;
                const pillColor =
                  stage === "completed"
                    ? theme.colors.success
                    : stage === "processing"
                      ? theme.colors.warning
                      : stage === "approved"
                        ? theme.colors.secondary
                        : stage === "rejected"
                          ? theme.colors.danger
                          : theme.colors.primary;

                return (
                  <>
                    <View style={styles.orderTopRow}>
                      <Text
                        style={[
                          styles.orderNumber,
                          { color: theme.colors.text },
                        ]}
                      >
                        {row.order_number}
                      </Text>
                      <Text
                        style={[
                          styles.statusPill,
                          {
                            color: pillColor,
                            backgroundColor: pillColor + "1A",
                          },
                        ]}
                      >
                        {(row.order_status || "submitted").toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.stageMeaning, { color: pillColor }]}>
                      {stageMeaning(stage)}
                    </Text>
                    <Text style={[styles.stageDecision, { color: pillColor }]}>
                      {stage === "rejected"
                        ? `Decision: Rejected - ${row.order_number} did not pass admin review.`
                        : `Decision: Accepted - ${row.order_number} passed admin review.`}
                    </Text>
                    <View
                      style={[
                        styles.stageRow,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      {labels.map((label, index) => {
                        const chipStep = index + 1;
                        const active = step >= chipStep && stage !== "rejected";
                        return (
                          <View
                            key={`${row.queue_id}-${label}`}
                            style={[
                              styles.stageChip,
                              {
                                borderColor: active
                                  ? theme.colors.success
                                  : theme.colors.border,
                                backgroundColor: active
                                  ? theme.colors.success + "14"
                                  : "transparent",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.stageChipText,
                                {
                                  color: active
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
                  </>
                );
              })()}
              <View style={styles.kvRow}>
                <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>
                  Queue type
                </Text>
                <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                  {row.queue_type || "-"}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>
                  IDs
                </Text>
                <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                  Order {row.order_id} | Queue {row.queue_id}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>
                  Priority
                </Text>
                <Text
                  style={[
                    styles.kvValue,
                    {
                      color:
                        row.priority?.toLowerCase() === "high"
                          ? theme.colors.danger
                          : theme.colors.warning,
                    },
                  ]}
                >
                  {(row.priority || "standard").toUpperCase()}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>
                  Equipment
                </Text>
                <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                  {row.equipment_name || "Unassigned"}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>
                  Samples
                </Text>
                <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                  {row.sample_types?.length ?? 0}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>
                  ETA
                </Text>
                <Text style={[styles.kvValue, { color: theme.colors.text }]}>
                  {formatDate(row.estimated_completion || row.scheduled_end)}
                </Text>
              </View>
            </View>
          ))}

          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              No completed orders found.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  summaryCard: {
    width: "31%",
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: { fontSize: 20, fontWeight: "800", marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  rowInputs: { flexDirection: "row", gap: 8 },
  inputHalf: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
  },
  actions: { flexDirection: "row", gap: 4, alignItems: "flex-start" },
  statusWrap: { flex: 1, zIndex: 3 },
  statusBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBtnText: { fontSize: 12, fontWeight: "700" },
  statusDropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  statusItem: { paddingHorizontal: 10, paddingVertical: 8 },
  statusItemText: { fontSize: 12, fontWeight: "700" },
  btn: {
    flex: 0,
    minWidth: 88,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  sectionSub: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  guideWrap: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  guideTitle: { fontSize: 12, fontWeight: "800", marginBottom: 2 },
  guideLine: { fontSize: 11, fontWeight: "700" },
  orderCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  orderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderNumber: { fontSize: 14, fontWeight: "800", flex: 1 },
  statusPill: {
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  stageMeaning: { fontSize: 12, fontWeight: "700" },
  stageDecision: { fontSize: 11, fontWeight: "700" },
  stageRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    flexDirection: "row",
    gap: 6,
  },
  stageChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  stageChipText: { fontSize: 10, fontWeight: "800" },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kvKey: { fontSize: 11, fontWeight: "700" },
  kvValue: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: "62%",
    textAlign: "right",
  },
  empty: { fontSize: 12, fontWeight: "700", marginTop: 6 },
});
