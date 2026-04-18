import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { customerMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { createCustomerOrder } from "../lib/orders-api-enhanced";
import { useAppTheme } from "../lib/theme";

export default function CustomerNewOrderPage() {
  const theme = useAppTheme();
  const [priority, setPriority] = useState<"standard" | "priority">("standard");
  const [sampleType, setSampleType] = useState<"" | "ore" | "liquid">("");
  const [compoundName, setCompoundName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"" | "g" | "kg" | "mL" | "L">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const feedback = useFeedbackModal();

  const canSubmit = useMemo(() => {
    return (
      sampleType.length > 0 &&
      compoundName.trim().length > 1 &&
      Number(quantity) > 0 &&
      unit.length > 0
    );
  }, [sampleType, compoundName, quantity, unit]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await createCustomerOrder({
        priority,
        sample_type: sampleType,
        compound_name: compoundName.trim(),
        quantity: Number(quantity),
        unit: unit as Exclude<typeof unit, "">,
        sample_count: Number(quantity),
        notes: notes.trim() || undefined,
      });
      feedback.showSuccess(
        "Order Submitted Successfully",
        `Your order has been submitted. Reference: ${result.data?.order_number || "Pending"}. It is now Pending until admin accepts it.`,
      );

      // Reset form
      setPriority("standard");
      setSampleType("");
      setCompoundName("");
      setQuantity("");
      setUnit("");
      setNotes("");

      // Move customer to live order tracking after submit.
      router.replace("/customer-my-orders");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to submit order — please check your connection and try again.";

      const looksLikeSessionIssue =
        /no active session|unauthorized|401|session/i.test(errorMessage);

      if (looksLikeSessionIssue) {
        feedback.showError(
          "Session Expired",
          "Please log in again, then submit your order.",
        );
        router.replace("/login");
        return;
      }

      feedback.showError("Order Submission Failed", errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleContentPage
      title="New Order"
      subtitle="Submit a new chemical compound testing request."
      role="Customer"
      activeKey="new-order"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
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
              <Text style={[styles.heading, { color: theme.colors.text }]}>
                Submit New Order
              </Text>
              <Text
                style={[styles.subHeading, { color: theme.colors.textMuted }]}
              >
                Request chemical compound testing
              </Text>

              <Text style={[styles.label, { color: theme.colors.text }]}>
                Priority Level *
              </Text>
              <View style={styles.choiceRow}>
                <Pressable
                  onPress={() => setPriority("standard")}
                  style={[
                    styles.choiceBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor:
                        priority === "standard"
                          ? theme.colors.primary
                          : theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceTitle,
                      {
                        color:
                          priority === "standard" ? "#fff" : theme.colors.text,
                      },
                    ]}
                  >
                    Standard
                  </Text>
                  <Text
                    style={[
                      styles.choiceSub,
                      {
                        color:
                          priority === "standard"
                            ? "#fff"
                            : theme.colors.textMuted,
                      },
                    ]}
                  >
                    Regular Queue
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPriority("priority")}
                  style={[
                    styles.choiceBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor:
                        priority === "priority"
                          ? theme.colors.secondary
                          : theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceTitle,
                      {
                        color:
                          priority === "priority" ? "#fff" : theme.colors.text,
                      },
                    ]}
                  >
                    Priority
                  </Text>
                  <Text
                    style={[
                      styles.choiceSub,
                      {
                        color:
                          priority === "priority"
                            ? "#fff"
                            : theme.colors.textMuted,
                      },
                    ]}
                  >
                    Night Shift
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.label, { color: theme.colors.text }]}>
                Sample Type *
              </Text>
              <View style={styles.choiceRow}>
                <Pressable
                  onPress={() => setSampleType("ore")}
                  style={[
                    styles.choiceBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor:
                        sampleType === "ore"
                          ? theme.colors.primary
                          : theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceTitle,
                      {
                        color:
                          sampleType === "ore" ? "#fff" : theme.colors.text,
                      },
                    ]}
                  >
                    Ore
                  </Text>
                  <Text
                    style={[
                      styles.choiceSub,
                      {
                        color:
                          sampleType === "ore"
                            ? "#fff"
                            : theme.colors.textMuted,
                      },
                    ]}
                  >
                    30 min prep time
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSampleType("liquid")}
                  style={[
                    styles.choiceBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor:
                        sampleType === "liquid"
                          ? theme.colors.secondary
                          : theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceTitle,
                      {
                        color:
                          sampleType === "liquid" ? "#fff" : theme.colors.text,
                      },
                    ]}
                  >
                    Liquid
                  </Text>
                  <Text
                    style={[
                      styles.choiceSub,
                      {
                        color:
                          sampleType === "liquid"
                            ? "#fff"
                            : theme.colors.textMuted,
                      },
                    ]}
                  >
                    No prep needed
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.label, { color: theme.colors.text }]}>
                Compound Name *
              </Text>
              <TextInput
                value={compoundName}
                onChangeText={setCompoundName}
                placeholder="e.g., Iron Oxide, Sulfuric Acid"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    borderColor:
                      compoundName.length > 0 && compoundName.trim().length < 2
                        ? theme.colors.danger
                        : theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
              />
              {compoundName.length > 0 && compoundName.trim().length < 2 && (
                <Text
                  style={[styles.fieldError, { color: theme.colors.danger }]}
                >
                  Name must be at least 2 characters
                </Text>
              )}

              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={[styles.label, { color: theme.colors.text }]}>
                    Quantity *
                  </Text>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="Amount"
                    keyboardType="decimal-pad"
                    placeholderTextColor={theme.colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={[
                      styles.input,
                      {
                        color: theme.colors.text,
                        borderColor:
                          quantity.length > 0 && !(Number(quantity) > 0)
                            ? theme.colors.danger
                            : theme.colors.border,
                        backgroundColor: theme.colors.inputBg,
                      },
                    ]}
                  />
                  {quantity.length > 0 && !(Number(quantity) > 0) && (
                    <Text
                      style={[
                        styles.fieldError,
                        { color: theme.colors.danger },
                      ]}
                    >
                      Enter a valid amount
                    </Text>
                  )}
                </View>
                <View style={styles.gridCol}>
                  <Text style={[styles.label, { color: theme.colors.text }]}>
                    Unit *
                  </Text>
                  <View style={styles.unitGrid}>
                    {(["g", "kg", "mL", "L"] as const).map((value) => (
                      <Pressable
                        key={value}
                        onPress={() => setUnit(value)}
                        style={[
                          styles.unitBtn,
                          {
                            borderColor: theme.colors.border,
                            backgroundColor:
                              unit === value
                                ? theme.colors.primary
                                : theme.colors.surfaceMuted,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.unitText,
                            {
                              color:
                                unit === value ? "#fff" : theme.colors.text,
                            },
                          ]}
                        >
                          {value}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={[styles.label, { color: theme.colors.text }]}>
                Notes
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add extra instructions, testing context, or handling notes"
                placeholderTextColor={theme.colors.textMuted}
                multiline
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.notesInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
              />

              <GradientButton
                disabled={!canSubmit || submitting}
                onPress={handleSubmit}
              >
                {submitting ? "Submitting..." : "Submit Order"}
              </GradientButton>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  heading: { fontSize: 20, fontWeight: "800" },
  subHeading: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  label: { fontSize: 12, fontWeight: "800" },
  choiceRow: { flexDirection: "row", gap: 8 },
  choiceBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  choiceTitle: { fontSize: 13, fontWeight: "800" },
  choiceSub: { fontSize: 11, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 96,
  },
  gridRow: { flexDirection: "row", gap: 10 },
  gridCol: { flex: 1, gap: 8 },
  unitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  unitBtn: {
    minWidth: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  unitText: { fontSize: 12, fontWeight: "700" },
  buttonText: { color: "#fff", fontWeight: "800" },
  fieldError: { fontSize: 11, fontWeight: "600", marginTop: -4 },
});
