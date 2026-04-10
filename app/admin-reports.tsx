import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import {
    generateReport,
    type ReportRequest,
    type ReportResponse,
} from "../lib/admin-api";
import { useAppTheme } from "../lib/theme";

export default function AdminReportsPage() {
  const theme = useAppTheme();
  const [type, setType] = useState<ReportRequest["type"]>("orders");
  const [option, setOption] = useState("today");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const reportCards = useMemo(
    () => [
      {
        title: "Orders Report",
        description:
          "View order statistics, processing times, and completion rates.",
        type: "orders" as const,
        options: ["today", "week", "month", "quarter", "year"],
      },
      {
        title: "Revenue Report",
        description:
          "View payment statistics, revenue trends, and financial summaries.",
        type: "revenue" as const,
        options: ["today", "week", "month", "quarter", "year"],
      },
      {
        title: "Equipment Performance",
        description:
          "View equipment utilization, delays, and maintenance history.",
        type: "equipment" as const,
        options: ["all", "icp", "xrf", "mass"],
      },
      {
        title: "Queue Analytics",
        description:
          "View queue statistics, wait times, and processing efficiency.",
        type: "queue" as const,
        options: ["all", "standard", "priority"],
      },
    ],
    [],
  );

  const runReport = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      let result = await generateReport({ type, option });

      // Fallback to safer default options if backend rejects a specific option.
      if (
        !result ||
        (typeof result === "object" &&
          !(result as any).summary &&
          !(result as any).rows &&
          !(result as any).data)
      ) {
        const fallbackOption =
          type === "equipment" || type === "queue" ? "all" : "today";
        result = await generateReport({ type, option: fallbackOption });
      }

      setReport(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Failed to generate report.",
      );
    } finally {
      setLoading(false);
    }
  }, [type, option]);

  useEffect(() => {
    runReport();
  }, [runReport]);

  useEffect(() => {
    const timer = setInterval(() => {
      runReport();
    }, 10000);

    return () => clearInterval(timer);
  }, [runReport]);

  const reportRows = useMemo(() => {
    if (!report || typeof report !== "object")
      return [] as Record<string, unknown>[];
    const anyReport = report as Record<string, unknown>;
    const candidates = [
      anyReport.rows,
      anyReport.data,
      anyReport.items,
      anyReport.result,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate as Record<string, unknown>[];
      }
    }
    return [] as Record<string, unknown>[];
  }, [report]);

  const reportSummary = useMemo(() => {
    if (!report || typeof report !== "object") return "";
    const anyReport = report as Record<string, unknown>;
    if (typeof anyReport.summary === "string") return anyReport.summary;
    if (typeof anyReport.message === "string") return anyReport.message;
    if (reportRows.length > 0) return `Generated ${reportRows.length} rows.`;
    return "";
  }, [report, reportRows.length]);

  const selectedCard = useMemo(
    () => reportCards.find((c) => c.type === type),
    [reportCards, type],
  );

  const chartMetrics = useMemo(() => {
    const totals = new Map<string, number>();

    reportRows.forEach((row) => {
      Object.entries(row).forEach(([key, raw]) => {
        const numeric = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(numeric)) return;
        totals.set(key, (totals.get(key) || 0) + numeric);
      });
    });

    return Array.from(totals.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [reportRows]);

  const chartMax = useMemo(() => {
    if (chartMetrics.length === 0) return 1;
    return Math.max(...chartMetrics.map((item) => item.value), 1);
  }, [chartMetrics]);

  const actionGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];

  return (
    <RoleContentPage
      title="Reports"
      subtitle="Generate and view reports on orders, revenue, and system performance."
      activeKey="reports"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
    >
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        <View
          style={[
            styles.liveStrip,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <Text style={[styles.liveStripTitle, { color: theme.colors.text }]}>
            Realtime Reports
          </Text>
          <View style={styles.liveStripMeta}>
            <Ionicons
              name={loading ? "sync" : "pulse-outline"}
              size={14}
              color={theme.colors.textMuted}
            />
            <Text
              style={[styles.liveStripSub, { color: theme.colors.textMuted }]}
            >
              Auto-refresh every 10s · Updated {lastUpdated || "--"}
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
          {reportCards.map((card) => {
            const selected = card.type === type;
            return (
              <View
                key={card.title}
                style={[
                  styles.reportCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[styles.reportTitle, { color: theme.colors.text }]}
                >
                  {card.title}
                </Text>
                <Text
                  style={[styles.reportDesc, { color: theme.colors.textMuted }]}
                >
                  {card.description}
                </Text>

                <View style={styles.optionRow}>
                  {card.options.map((opt) => {
                    const optActive = selected && option === opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => {
                          setType(card.type);
                          setOption(opt);
                        }}
                        style={[
                          styles.optionChip,
                          {
                            borderColor: optActive
                              ? theme.colors.primary
                              : theme.colors.border,
                            backgroundColor: optActive
                              ? theme.colors.primarySoft
                              : theme.colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            {
                              color: optActive
                                ? theme.colors.primary
                                : theme.colors.textMuted,
                            },
                          ]}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <GradientButton
                  onPress={runReport}
                  style={styles.actionBtn}
                  colors={actionGradient}
                  compact
                >
                  <Text style={styles.actionBtnText}>
                    {loading && selected ? "Generating..." : "Generate Now"}
                  </Text>
                </GradientButton>
              </View>
            );
          })}
        </View>

        <View
          style={[
            styles.outputCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.outputTitle, { color: theme.colors.text }]}>
            {selectedCard?.title || "Report Output"}
          </Text>
          {errorText ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {errorText}
            </Text>
          ) : null}

          {!report && !loading ? (
            <Text
              style={[styles.emptyState, { color: theme.colors.textMuted }]}
            >
              Select a report type and click Generate to view results.
            </Text>
          ) : null}

          {reportSummary ? (
            <Text style={[styles.summary, { color: theme.colors.text }]}>
              {reportSummary}
            </Text>
          ) : null}

          {chartMetrics.length > 0 ? (
            <View
              style={[
                styles.chartCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.chartTitle, { color: theme.colors.text }]}>
                Live Metrics
              </Text>
              {chartMetrics.map((metric) => {
                const widthPercent = Math.max(
                  10,
                  Math.round((metric.value / chartMax) * 100),
                );
                return (
                  <View key={metric.key} style={styles.chartRow}>
                    <Text
                      style={[
                        styles.chartLabel,
                        { color: theme.colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {metric.key}
                    </Text>
                    <View
                      style={[
                        styles.chartTrack,
                        { backgroundColor: theme.colors.surface },
                      ]}
                    >
                      <View
                        style={[
                          styles.chartFill,
                          {
                            width: `${widthPercent}%`,
                            backgroundColor: theme.colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.chartValue, { color: theme.colors.text }]}
                    >
                      {Number.isInteger(metric.value)
                        ? metric.value
                        : metric.value.toFixed(2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {reportRows.length === 0 && !loading && !errorText ? (
            <Text
              style={[styles.emptyState, { color: theme.colors.textMuted }]}
            >
              No rows returned for this report selection.
            </Text>
          ) : null}

          {reportRows.slice(0, 12).map((row, index) => (
            <View
              key={index}
              style={[
                styles.row,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              {Object.entries(row)
                .slice(0, 6)
                .map(([key, value]) => (
                  <View key={key} style={styles.kvRow}>
                    <Text
                      style={[styles.kvKey, { color: theme.colors.textMuted }]}
                    >
                      {key}
                    </Text>
                    <Text
                      style={[styles.kvValue, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {String(value ?? "-")}
                    </Text>
                  </View>
                ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  liveStrip: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  liveStripTitle: { fontSize: 14, fontWeight: "800" },
  liveStripMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveStripSub: { fontSize: 12, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  reportCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  reportTitle: { fontSize: 15, fontWeight: "800" },
  reportDesc: { fontSize: 12, lineHeight: 18 },
  optionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionText: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  actionBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "800" },
  outputCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  outputTitle: { fontSize: 16, fontWeight: "800" },
  emptyState: { fontSize: 12, fontWeight: "700" },
  summary: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  chartCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  chartTitle: { fontSize: 13, fontWeight: "800" },
  chartRow: { gap: 6 },
  chartLabel: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  chartTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  chartFill: { height: 8, borderRadius: 999 },
  chartValue: { fontSize: 11, fontWeight: "800", textAlign: "right" },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kvKey: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
    flex: 1,
  },
  kvValue: { fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  errorText: { fontSize: 13, fontWeight: "700" },
});
