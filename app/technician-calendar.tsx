import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { useCachedScreenState } from "../hooks/use-screen-cache";
import {
    assignOrderEquipment,
    completeQueueOrder,
    fetchQueueEntryDetails,
    fetchTechnicianWorkQueue,
    rescheduleQueue,
    type EquipmentRow,
    type QueueEntry,
} from "../lib/calendar-api";
import {
    backendDateTimeValue,
    formatBackendDateTime,
    formatBackendTimestamp,
    parseBackendDate,
} from "../lib/date-time";
import { normalizeOrderStatusForCompare } from "../lib/order-status-normalize";
import { toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

const MIN_PROCESSING_WINDOW_MS = 20 * 60 * 1000;

type QueueSortMode = "queue" | "newest" | "oldest";

const formatText = (value?: string | null, fallback = "Not available") => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const formatSampleSummary = (entry: QueueEntry) => {
  const sample = entry.sample_type?.trim();
  const samples = entry.sample_types.filter(Boolean);
  if (sample) return sample;
  if (samples.length > 0) return samples.join(", ");
  return "Sample details not available";
};

const formatQueueWindow = (entry: QueueEntry) => {
  const start = formatBackendDateTime(entry.scheduled_start, "Not scheduled");
  const end = formatBackendDateTime(
    entry.scheduled_end || entry.estimated_completion,
    "Pending",
  );
  return `${start} • ${end}`;
};

const formatQuantityText = (entry: QueueEntry) => {
  if (typeof entry.quantity === "number" && Number.isFinite(entry.quantity)) {
    return `${entry.quantity} ${entry.unit || ""}`.trim();
  }
  return "Not provided";
};

const formatStatusText = (value?: string | null) => {
  const normalized = (value || "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Not available";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const technicianOrderSummary = (value?: string) => {
  const lifecycle = toLifecycleStatus(value);
  if (lifecycle === "completed" || lifecycle === "results_available") {
    return "Order completed in technician workflow.";
  }
  if (lifecycle === "testing" || lifecycle === "preparation") {
    return "Order is currently in technician processing.";
  }
  if (
    lifecycle === "payment_pending" ||
    lifecycle === "approved" ||
    lifecycle === "in_queue"
  ) {
    return "Live queue item ready for technician handling.";
  }
  return "Awaiting technician update.";
};

const toValidDate = (value?: string | null) => parseBackendDate(value);

const toEditableDateValue = (value?: string | null) => {
  if (!value) return "";
  const parsed = parseBackendDate(value);
  if (!parsed) return value;
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const getProcessingWindowEnd = (
  entry: QueueEntry,
  processingStartedAt?: Date,
) => {
  const scheduledStart = toValidDate(entry.scheduled_start);
  const estimatedCompletion =
    toValidDate(entry.estimated_completion) ?? toValidDate(entry.scheduled_end);

  if (!scheduledStart && !estimatedCompletion && !processingStartedAt) {
    return null;
  }

  const candidates = [estimatedCompletion].filter(
    (value): value is Date => Boolean(value),
  );
  const baseStart = processingStartedAt ?? scheduledStart;

  if (baseStart) {
    candidates.push(new Date(baseStart.getTime() + MIN_PROCESSING_WINDOW_MS));
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
};

const isPriorityQueueEntry = (entry: QueueEntry) => {
  const priority = (entry.priority || "").trim().toLowerCase();
  const queueType = (entry.queue_type || "").trim().toLowerCase();
  return priority === "priority" || priority === "high" || queueType === "priority";
};

export default function TechnicianCalendarPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();
  const [entries, setEntries] = useCachedScreenState<QueueEntry[]>(
    "technician-calendar:entries:v4",
    [],
  );
  const [equipment, setEquipment] = useCachedScreenState<EquipmentRow[]>(
    "technician-calendar:equipment:v4",
    [],
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "technician-calendar:lastUpdated:v5",
    "",
  );
  const [, setWebsitePendingCount] = useCachedScreenState(
    "technician-calendar:websitePendingCount:v5",
    0,
  );
  const [, setWebsiteQueueCount] = useCachedScreenState(
    "technician-calendar:websiteQueueCount:v5",
    0,
  );
  const [busyQueueId, setBusyQueueId] = useState<number | null>(null);
  const [equipmentTarget, setEquipmentTarget] = useState<QueueEntry | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<QueueEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<QueueEntry | null>(null);
  const [scheduledStartInput, setScheduledStartInput] = useState("");
  const [scheduledEndInput, setScheduledEndInput] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");
  const [sortMode, setSortMode] = useState<QueueSortMode>("queue");

  const loadCalendar = useCallback(async () => {
    try {
      const data = await fetchTechnicianWorkQueue();
      setEntries(data.queue ?? []);
      setEquipment(data.equipment ?? []);
      setWebsitePendingCount(
        typeof data.dashboardPendingCount === "number" ? data.dashboardPendingCount : 0,
      );
      setWebsiteQueueCount(
        typeof data.dashboardQueueCount === "number" ? data.dashboardQueueCount : 0,
      );
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    }
  }, [setEntries, setEquipment, setLastUpdated, setWebsitePendingCount, setWebsiteQueueCount]);

  useFocusedPolling(loadCalendar, { intervalMs: 12000 });

  const queueOrderedEntries = useMemo(() => {
    const seen = new Set<string>();
    return [...entries]
      .sort((a, b) => a.position - b.position)
      .filter((item) => {
        const key = (item.order_number || `${item.order_id || item.queue_id}`)
          .trim()
          .toLowerCase();

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const next = [...queueOrderedEntries];

    if (sortMode === "newest") {
      return next.sort((a, b) => {
        const at = backendDateTimeValue(
          a.assigned_at || a.scheduled_start || a.estimated_completion,
        );
        const bt = backendDateTimeValue(
          b.assigned_at || b.scheduled_start || b.estimated_completion,
        );
        return bt - at || a.position - b.position;
      });
    }

    if (sortMode === "oldest") {
      return next.sort((a, b) => {
        const at = backendDateTimeValue(
          a.assigned_at || a.scheduled_start || a.estimated_completion,
        );
        const bt = backendDateTimeValue(
          b.assigned_at || b.scheduled_start || b.estimated_completion,
        );
        return at - bt || a.position - b.position;
      });
    }

    return next;
  }, [queueOrderedEntries, sortMode]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;

    visibleEntries.forEach((item) => {
      const status = normalizeOrderStatusForCompare(item.order_status);
      if (status === "completed") {
        completed += 1;
      } else if (
        status === "pending" ||
        status === "approved" ||
        status === "payment_pending"
      ) {
        pending += 1;
      } else {
        inProgress += 1;
      }
    });

    return { pending, inProgress, completed };
  }, [visibleEntries]);

  const priorityEntries = useMemo(
    () => visibleEntries.filter((entry) => isPriorityQueueEntry(entry)),
    [visibleEntries],
  );

  const standardEntries = useMemo(
    () => visibleEntries.filter((entry) => !isPriorityQueueEntry(entry)),
    [visibleEntries],
  );

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === selectedEquipmentId) || null,
    [equipment, selectedEquipmentId],
  );

  const openDetailsModal = async (entry: QueueEntry) => {
    setDetailTarget(entry);
    setDetailLoading(true);

    try {
      const detailed = await fetchQueueEntryDetails(entry);
      setDetailTarget(detailed);
      setEntries((current) =>
        current.map((item) =>
          item.queue_id === detailed.queue_id || item.order_number === detailed.order_number
            ? { ...item, ...detailed }
            : item,
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditModal = (entry: QueueEntry) => {
    setEditTarget(entry);
    setScheduledStartInput(toEditableDateValue(entry.scheduled_start));
    setScheduledEndInput(
      toEditableDateValue(entry.scheduled_end || entry.estimated_completion),
    );
    setScheduleNote(entry.technician_status_note || "");
    setCompletionNote("");
    setAttachmentName("");
    setAttachmentUri("");
  };

  const pickAttachmentMedia = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        feedback.showError(
          "Permission required",
          "Allow media access to attach a photo or video from this device.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const nextName =
        asset.fileName?.trim() ||
        asset.uri.split("/").pop()?.split("?")[0] ||
        `media-${Date.now()}`;

      setAttachmentName(nextName);
      setAttachmentUri(asset.uri);
      feedback.showSuccess("Media attached", `${nextName} is ready to send.`);
    } catch (error) {
      feedback.showError(
        "Media selection failed",
        error instanceof Error ? error.message : "Unable to open the media picker.",
      );
    }
  };

  const saveScheduleFromModal = async (entry: QueueEntry) => {
    const startDate = parseBackendDate(scheduledStartInput);
    const endDate = parseBackendDate(scheduledEndInput);

    if (!startDate || !endDate) {
      feedback.showError(
        "Invalid schedule",
        "Enter both start and end values in a valid date and time format.",
      );
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      feedback.showError(
        "Invalid schedule",
        "Scheduled end must be later than scheduled start.",
      );
      return;
    }

    setBusyQueueId(entry.queue_id);
    try {
      await rescheduleQueue(
        {
          queueId: entry.queue_id,
          orderId: entry.order_id,
          orderNumber: entry.order_number,
        },
        formatBackendTimestamp(startDate),
        formatBackendTimestamp(endDate),
        scheduleNote.trim() || "Technician updated the order schedule from the mobile app.",
      );
      await loadCalendar();
      feedback.showSuccess(
        "Schedule Updated",
        `${entry.order_number} schedule was saved successfully.`,
      );
    } catch (error) {
      feedback.showError(
        "Schedule Save Failed",
        error instanceof Error ? error.message : "Unable to save schedule.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  const finishOrderFromModal = async (entry: QueueEntry) => {
    setBusyQueueId(entry.queue_id);
    try {
      await completeQueueOrder(
        {
          orderId: entry.order_id,
          orderNumber: entry.order_number,
          queueId: entry.queue_id,
        },
        {
          note: completionNote.trim() || "Order analysis is done.",
          attachmentName: attachmentName.trim() || undefined,
        },
      );
      await loadCalendar();
      setEditTarget(null);
      feedback.showSuccess(
        "Order Finished",
        `${entry.order_number} was marked as completed.`,
      );
    } catch (error) {
      feedback.showError(
        "Finish Failed",
        error instanceof Error ? error.message : "Unable to finish this order.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  const assignEquipment = async (
    entry: QueueEntry,
    nextEquipment: Pick<EquipmentRow, "id" | "name"> | null,
  ) => {
    const lifecycle = toLifecycleStatus(entry.order_status);
    if (lifecycle === "results_available" || lifecycle === "completed") {
      setEquipmentTarget(null);
      return;
    }

    setBusyQueueId(entry.queue_id);
    try {
      await assignOrderEquipment(
        {
          orderId: entry.order_id,
          orderNumber: entry.order_number,
          firebaseKey: entry.firebase_key,
          status: entry.order_status,
          queueId: entry.queue_id,
          scheduledStart: entry.scheduled_start,
          scheduledEnd: entry.scheduled_end || entry.estimated_completion,
        },
        nextEquipment,
      );
      await loadCalendar();
      setEquipmentTarget(null);
      feedback.showSuccess(
        nextEquipment ? "Equipment Assigned" : "Equipment Cleared",
        nextEquipment
          ? `${entry.order_number} is now using ${nextEquipment.name}.`
          : `${entry.order_number} no longer has assigned equipment.`,
      );
    } catch (error) {
      feedback.showError(
        "Equipment Update Failed",
        error instanceof Error ? error.message : "Unable to assign equipment.",
      );
    } finally {
      setBusyQueueId(null);
    }
  };

  const renderQueueCard = (entry: QueueEntry) => {
    const lifecycle = toLifecycleStatus(entry.order_status);
    const normalizedStatus = normalizeOrderStatusForCompare(entry.order_status);
    const alreadyCompleted =
      lifecycle === "results_available" ||
      lifecycle === "completed" ||
      normalizedStatus === "completed";
    const isPriority = isPriorityQueueEntry(entry);

    return (
      <View
        key={`${entry.queue_id}-${entry.order_number}`}
        style={[
          styles.row,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
      >
        <View style={styles.rowHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {entry.order_number}
            </Text>
            <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
              {formatSampleSummary(entry)}
            </Text>
          </View>
          <View
            style={[
              styles.priorityPill,
              {
                backgroundColor: isPriority
                  ? theme.colors.warning + "22"
                  : theme.colors.border + "55",
              },
            ]}
          >
            <Text
              style={[
                styles.priorityPillText,
                { color: isPriority ? theme.colors.warning : theme.colors.textMuted },
              ]}
            >
              {isPriority ? "PRIORITY" : "STANDARD"}
            </Text>
          </View>
        </View>

        <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
          {formatText(entry.equipment_name, "Pending equipment")}
        </Text>
        <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
          Queue #{entry.position} • {formatQueueWindow(entry)}
        </Text>
        <Text style={[styles.subStrong, { color: theme.colors.info }]}>
          {technicianOrderSummary(entry.order_status)}
        </Text>

        <View style={styles.rowActions}>
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.secondary, opacity: busyQueueId === entry.queue_id ? 0.7 : 1 },
            ]}
            disabled={busyQueueId === entry.queue_id}
            onPress={() => openDetailsModal(entry)}
          >
            <Text style={styles.actionBtnText}>View Details</Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.info, opacity: busyQueueId === entry.queue_id ? 0.7 : 1 },
            ]}
            disabled={busyQueueId === entry.queue_id}
            onPress={() => openEditModal(entry)}
          >
            <Text style={styles.actionBtnText}>Edit</Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.success, opacity: busyQueueId === entry.queue_id || alreadyCompleted ? 0.7 : 1 },
            ]}
            disabled={busyQueueId === entry.queue_id || alreadyCompleted}
            onPress={() =>
              confirm.openConfirm({
                title: "Finish Order",
                message: `Mark ${entry.order_number} as completed?`,
                confirmText: "Finish",
                onConfirm: () => finishOrderFromModal(entry),
              })
            }
          >
            <Text style={styles.actionBtnText}>{alreadyCompleted ? "Done" : "Finish"}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <RoleContentPage
      title="Calendar & Queue"
      subtitle="Scheduled technician orders and live queue management."
      role="Technician"
      activeKey="calendar"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
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
            <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>Updated {lastUpdated || "--"}</Text>
            <Pressable
              style={[styles.refreshBtn, { backgroundColor: theme.colors.primary }]}
              onPress={loadCalendar}
            >
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Queue / Timeline</Text>
          <View style={styles.statRow}>
            <View style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.chipText, { color: theme.colors.text }]}>Pending {statusCounts.pending}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.colors.info + "22" }]}>
              <Text style={[styles.chipText, { color: theme.colors.info }]}>In progress {statusCounts.inProgress}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.colors.success + "22" }]}>
              <Text style={[styles.chipText, { color: theme.colors.success }]}>Completed {statusCounts.completed}</Text>
            </View>
          </View>

          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>Live technician queue synced from the website.</Text>

          <View style={styles.sortRow}>
            {(
              [
                ["queue", "Queue Order"],
                ["newest", "Newest Added"],
                ["oldest", "Oldest Added"],
              ] as const
            ).map(([value, label]) => {
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

          <Text style={[styles.sortHint, { color: theme.colors.textMuted }]}>
            Sort the queue by newest or oldest so recent additions are easy to find.
          </Text>

          {visibleEntries.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No queue entries assigned.</Text>
          ) : (
            <>
              <Text style={[styles.queueSectionLabel, { color: theme.colors.primary }]}>PRIORITY QUEUE</Text>
              {priorityEntries.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No priority queue items.</Text>
              ) : (
                priorityEntries.map((entry) => renderQueueCard(entry))
              )}

              <Text style={[styles.queueSectionLabel, { color: theme.colors.secondary }]}>STANDARD QUEUE</Text>
              {standardEntries.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No standard queue items.</Text>
              ) : (
                standardEntries.map((entry) => renderQueueCard(entry))
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(detailTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailTarget(null)}
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
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Order Details</Text>
                  <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}>Customer-submitted request details and current technician queue data.</Text>
                </View>
                <Pressable
                  onPress={() => setDetailTarget(null)}
                  style={[
                    styles.modalCloseBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Ionicons name="close" size={18} color={theme.colors.text} />
                </Pressable>
              </View>

              {detailTarget ? (
                <View style={styles.detailsBox}>
                  {detailLoading ? (
                    <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Loading full customer request details…</Text>
                  ) : null}
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Order: {detailTarget.order_number}</Text>
                  {detailTarget.customer_name ? (
                    <Text style={[styles.detailLine, { color: theme.colors.text }]}>Customer: {detailTarget.customer_name}</Text>
                  ) : null}
                  {detailTarget.company_name ? (
                    <Text style={[styles.detailLine, { color: theme.colors.text }]}>Company: {detailTarget.company_name}</Text>
                  ) : null}
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Priority: {formatText(detailTarget.priority, "Standard")}</Text>
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Sample Type: {formatText(detailTarget.sample_type || detailTarget.sample_types?.join(", "))}</Text>
                  {detailTarget.compound_name ? (
                    <Text style={[styles.detailLine, { color: theme.colors.text }]}>Compound Name: {detailTarget.compound_name}</Text>
                  ) : null}
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Quantity: {formatQuantityText(detailTarget)}</Text>
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Submitted: {formatBackendDateTime(detailTarget.created_at, "Not available")}</Text>
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Status: {formatStatusText(detailTarget.order_status)}</Text>
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Equipment: {formatText(detailTarget.equipment_name, "Pending assignment")}</Text>
                  <Text style={[styles.detailLine, { color: theme.colors.text }]}>Schedule: {formatQueueWindow(detailTarget)}</Text>
                  {detailTarget.notes ? (
                    <Text style={[styles.detailLine, { color: theme.colors.text }]}>Customer Notes: {detailTarget.notes}</Text>
                  ) : null}
                  {detailTarget.technician_status_note ? (
                    <Text style={[styles.detailLine, { color: theme.colors.info }]}>Technician Update: {detailTarget.technician_status_note}</Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(editTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}
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
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Order Details & Edit</Text>
                  <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}>
                    {editTarget?.order_number} schedule and completion actions for the technician workflow.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setEditTarget(null)}
                  style={[
                    styles.modalCloseBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Ionicons name="close" size={18} color={theme.colors.text} />
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Scheduled start</Text>
              <TextInput
                value={scheduledStartInput}
                onChangeText={setScheduledStartInput}
                placeholder="YYYY-MM-DD HH:mm"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.fieldInput,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Scheduled end</Text>
              <TextInput
                value={scheduledEndInput}
                onChangeText={setScheduledEndInput}
                placeholder="YYYY-MM-DD HH:mm"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.fieldInput,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Optional note</Text>
              <TextInput
                value={scheduleNote}
                onChangeText={setScheduleNote}
                multiline
                placeholder="Optional note about this schedule change"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.textArea,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setEditTarget(null)}
                  style={[
                    styles.modalSecondaryBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!editTarget) return;
                    void saveScheduleFromModal(editTarget);
                  }}
                  disabled={!editTarget || busyQueueId === editTarget.queue_id}
                  style={[
                    styles.modalPrimaryBtn,
                    {
                      backgroundColor: theme.colors.primary,
                      opacity: !editTarget || busyQueueId === editTarget.queue_id ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={styles.modalPrimaryText}>Save Schedule</Text>
                </Pressable>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Mark as completed</Text>
              <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Send a completion update from the mobile app.</Text>
              <TextInput
                value={completionNote}
                onChangeText={setCompletionNote}
                multiline
                placeholder="Optional note for completion"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.textArea,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Attach media</Text>
              <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Upload a photo or video from your device, or enter a file name manually.</Text>

              <View style={styles.uploadRow}>
                <Pressable
                  onPress={() => void pickAttachmentMedia()}
                  disabled={!editTarget || busyQueueId === editTarget.queue_id}
                  style={[
                    styles.uploadBtn,
                    {
                      backgroundColor: theme.colors.primary,
                      opacity: !editTarget || busyQueueId === editTarget.queue_id ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="images-outline" size={16} color="#fff" />
                  <Text style={styles.uploadBtnText}>
                    {attachmentName ? "Change Media" : "Upload Media"}
                  </Text>
                </Pressable>

                {attachmentName ? (
                  <Pressable
                    onPress={() => {
                      setAttachmentName("");
                      setAttachmentUri("");
                    }}
                    style={[
                      styles.modalSecondaryBtn,
                      {
                        flex: 0,
                        paddingHorizontal: 14,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>

              <TextInput
                value={attachmentName}
                onChangeText={setAttachmentName}
                placeholder="e.g. results.jpg or report.mp4"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.fieldInput,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
              />

              {attachmentUri ? (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Selected media: {attachmentName}</Text>
              ) : null}

              <Pressable
                onPress={() => {
                  if (!editTarget) return;
                  void finishOrderFromModal(editTarget);
                }}
                disabled={!editTarget || busyQueueId === editTarget.queue_id}
                style={[
                  styles.finishBtn,
                  {
                    backgroundColor: theme.colors.success,
                    opacity: !editTarget || busyQueueId === editTarget.queue_id ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={styles.modalPrimaryText}>Finish Order</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(
          equipmentTarget &&
            toLifecycleStatus(equipmentTarget.order_status) !== "results_available" &&
            toLifecycleStatus(equipmentTarget.order_status) !== "completed",
        )}
        transparent
        animationType="fade"
        onRequestClose={() => setEquipmentTarget(null)}
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
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Assign Equipment</Text>
                <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}>
                  {equipmentTarget?.order_number} will use the selected equipment in the live order flow.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setEquipmentTarget(null);
                  setEquipmentPickerOpen(false);
                }}
                style={[
                  styles.modalCloseBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Choose equipment</Text>
            <Pressable
              onPress={() => setEquipmentPickerOpen((value) => !value)}
              disabled={!equipmentTarget || busyQueueId === equipmentTarget?.queue_id}
              style={[
                styles.selectorBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                  opacity: !equipmentTarget || busyQueueId === equipmentTarget?.queue_id ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.selectorInner}>
                <Text style={[styles.selectorText, { color: theme.colors.text }]}>
                  {selectedEquipment?.name || equipmentTarget?.equipment_name || "Select equipment"}
                </Text>
                <Ionicons
                  name={equipmentPickerOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.colors.textMuted}
                />
              </View>
            </Pressable>

            {equipmentPickerOpen ? (
              <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                {equipment.length === 0 ? (
                  <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No equipment entries available.</Text>
                ) : (
                  equipment.map((item) => {
                    const selected = selectedEquipmentId === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        disabled={busyQueueId === equipmentTarget?.queue_id}
                        onPress={() => {
                          setSelectedEquipmentId(item.id);
                          setEquipmentPickerOpen(false);
                        }}
                        style={[
                          styles.modalOption,
                          {
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceMuted,
                            opacity: busyQueueId === equipmentTarget?.queue_id ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.modalOptionTitle, { color: theme.colors.text }]}>{item.name}</Text>
                        <Text style={[styles.modalOptionSub, { color: theme.colors.textMuted }]}>
                          {item.equipment_type || "Equipment"} | {item.is_available ? "Available" : "Busy"}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setEquipmentTarget(null);
                  setEquipmentPickerOpen(false);
                }}
                style={[
                  styles.modalSecondaryBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!equipmentTarget) return;
                  void assignEquipment(equipmentTarget, selectedEquipment);
                }}
                disabled={!equipmentTarget || busyQueueId === equipmentTarget.queue_id}
                style={[
                  styles.modalPrimaryBtn,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: !equipmentTarget || busyQueueId === equipmentTarget.queue_id ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={styles.modalPrimaryText}>Save Equipment</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                if (!equipmentTarget) return;
                setSelectedEquipmentId(null);
                void assignEquipment(equipmentTarget, null);
              }}
              disabled={!equipmentTarget || busyQueueId === equipmentTarget.queue_id}
              style={[
                styles.finishBtn,
                {
                  backgroundColor: theme.colors.danger,
                  opacity: !equipmentTarget || busyQueueId === equipmentTarget.queue_id ? 0.7 : 1,
                },
              ]}
            >
              <Text style={styles.modalPrimaryText}>Clear Equipment</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {feedback.modal}
      {confirm.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  updatedText: { fontSize: 12, fontWeight: "700" },
  refreshBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  sectionSub: { fontSize: 12, lineHeight: 18 },
  sortRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sortChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortChipText: { fontSize: 11, fontWeight: "800" },
  sortHint: { fontSize: 11, fontWeight: "700", lineHeight: 16 },
  queueSectionLabel: { fontSize: 12, fontWeight: "900", marginTop: 10 },
  statRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: "800" },
  empty: { fontSize: 12, fontWeight: "700" },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  rowHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priorityPillText: { fontSize: 10, fontWeight: "800" },
  title: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12 },
  subStrong: { fontSize: 12, fontWeight: "700" },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  actionBtn: {
    flex: 1,
    minWidth: 92,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalSub: { fontSize: 13, fontWeight: "600", lineHeight: 20, marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: "800", marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 84,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  helperText: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  uploadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  uploadBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  divider: { height: 1, marginVertical: 14 },
  finishBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
  },
  detailsBox: { gap: 8, paddingTop: 4 },
  detailLine: { fontSize: 13, lineHeight: 20, fontWeight: "600" },
  modalList: { maxHeight: 280 },
  modalListContent: { gap: 8, paddingBottom: 4 },
  modalOption: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  modalOptionTitle: { fontSize: 14, fontWeight: "800" },
  modalOptionSub: { fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalSecondaryText: { fontSize: 12, fontWeight: "800" },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
