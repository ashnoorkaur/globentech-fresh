import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

const firstParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] || "" : value || "";

const sanitizeDigits = (value: string) => value.replace(/\D/g, "");

const formatCardNumber = (value: string) =>
  sanitizeDigits(value)
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();

const formatExpiry = (value: string) => {
  const digits = sanitizeDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

const passesLuhnCheck = (value: string) => {
  const digits = sanitizeDigits(value);
  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
};

const isSupportedCard = (value: string) => {
  const digits = sanitizeDigits(value);
  return (
    /^4\d{12}(?:\d{3})?$/.test(digits) ||
    /^(5[1-5]\d{14}|2(?:2[2-9]|[3-6]\d|7[01])\d{12}|2720\d{12})$/.test(digits) ||
    /^3[47]\d{13}$/.test(digits) ||
    /^6(?:011|5\d{2})\d{12}$/.test(digits)
  );
};

const isValidCardNumber = (value: string) =>
  isSupportedCard(value) && passesLuhnCheck(value);

const isValidExpiry = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;

  const month = Number(match[1]);
  const year = Number(`20${match[2]}`);
  if (month < 1 || month > 12) return false;

  const now = new Date();
  const expiryDate = new Date(year, month, 0, 23, 59, 59);
  return expiryDate >= now;
};

const computeAmount = (priority: string, sampleCount: number) => {
  const normalizedSamples = Number.isFinite(sampleCount) && sampleCount > 0 ? sampleCount : 1;
  const priorityFee = priority.toLowerCase() === "priority" ? 50 : 0;
  const extraSamples = Math.max(0, normalizedSamples - 1) * 25;
  return 150 + priorityFee + extraSamples;
};

export default function CustomerCheckoutPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const session = useSessionState();
  const params = useLocalSearchParams();

  const orderId = firstParam(params.orderId);
  const orderNumber = firstParam(params.orderNumber) || `ORD-${orderId || "----"}`;
  const priority = firstParam(params.priority) || "standard";
  const sampleType = firstParam(params.sampleType);
  const compoundName = firstParam(params.compoundName);
  const unit = firstParam(params.unit);
  const quantity = Number(firstParam(params.quantity) || 0);
  const sampleCount = Number(firstParam(params.sampleCount) || quantity || 1);
  const amount = Number(firstParam(params.amount) || computeAmount(priority, sampleCount));

  const [email, setEmail] = useState(
    session.user?.email?.trim() || "customer@globentech.com",
  );
  const [nameOnCard, setNameOnCard] = useState(
    session.user?.full_name?.trim() || "",
  );
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [paid, setPaid] = useState(false);

  const canSubmit = useMemo(
    () =>
      isValidEmail(email) &&
      nameOnCard.trim().length >= 2 &&
      isValidCardNumber(cardNumber) &&
      isValidExpiry(expiry) &&
      /^\d{3,4}$/.test(cvc),
    [cardNumber, cvc, email, expiry, nameOnCard],
  );

  const totalLabel = `$${amount.toFixed(2)}`;

  const handlePay = () => {
    if (!isValidEmail(email)) {
      feedback.showError("Invalid email", "Enter a valid customer email before continuing.");
      return;
    }
    if (nameOnCard.trim().length < 2) {
      feedback.showError("Missing cardholder name", "Enter the full name shown on the card.");
      return;
    }
    if (!isValidCardNumber(cardNumber)) {
      feedback.showError("Invalid card number", "Please enter a valid Visa, Mastercard, Amex, or Discover card number.");
      return;
    }
    if (!isValidExpiry(expiry)) {
      feedback.showError("Invalid expiry date", "Use a future expiry date in MM/YY format.");
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      feedback.showError("Invalid CVC", "Enter a valid 3 or 4 digit security code.");
      return;
    }

    setPaid(true);
    feedback.showSuccess(
      "Payment validated",
      `${orderNumber} is ready for secure checkout with ${totalLabel} CAD.`,
    );
  };

  return (
    <RoleContentPage
      title="Secure Checkout"
      subtitle="Card payments are processed securely using Stripe."
      role="Customer"
      activeKey="my-orders"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.currencyText, { color: theme.colors.textMuted }]}>Currency: CAD</Text>

            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Customer Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="customer@globentech.com"
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

            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Card Details</Text>
            <TextInput
              value={nameOnCard}
              onChangeText={setNameOnCard}
              placeholder="Name on card"
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
            <TextInput
              value={cardNumber}
              onChangeText={(value) => setCardNumber(formatCardNumber(value))}
              placeholder="1234 5678 9012 3456"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
            />
            <View style={styles.row}>
              <TextInput
                value={expiry}
                onChangeText={(value) => setExpiry(formatExpiry(value))}
                placeholder="MM/YY"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  styles.halfInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
              />
              <TextInput
                value={cvc}
                onChangeText={(value) => setCvc(sanitizeDigits(value).slice(0, 4))}
                placeholder="CVC"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  styles.halfInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
              />
            </View>

            <Pressable
              onPress={handlePay}
              style={[
                styles.payButton,
                {
                  backgroundColor: canSubmit ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Text style={styles.payButtonText}>
                {canSubmit ? `Pay ${totalLabel}` : "Enter valid card details"}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.replace("/customer-my-orders")}> 
              <Text style={[styles.backText, { color: theme.colors.primary }]}>← Back to My Orders</Text>
            </Pressable>

            <View
              style={[
                styles.summaryBox,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>Order Summary</Text>
              <View style={styles.summaryRow}><Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Order Number</Text><Text style={[styles.summaryValue, { color: theme.colors.text }]}>{orderNumber}</Text></View>
              <View style={styles.summaryRow}><Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Order ID</Text><Text style={[styles.summaryValue, { color: theme.colors.text }]}>{orderId || "-"}</Text></View>
              <View style={styles.summaryRow}><Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Payment Method</Text><Text style={[styles.summaryValue, { color: theme.colors.text }]}>Credit / Debit Card</Text></View>
              {sampleType || compoundName ? (
                <View style={styles.summaryRow}><Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Request</Text><Text style={[styles.summaryValue, { color: theme.colors.text }]}>{[sampleType, compoundName].filter(Boolean).join(" • ")}</Text></View>
              ) : null}
              {quantity > 0 ? (
                <View style={styles.summaryRow}><Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Quantity</Text><Text style={[styles.summaryValue, { color: theme.colors.text }]}>{`${quantity} ${unit || ""}`.trim()}</Text></View>
              ) : null}
              <View style={styles.summaryRow}><Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Total</Text><Text style={[styles.totalValue, { color: theme.colors.primary }]}>{totalLabel} CAD</Text></View>
            </View>

            <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>Postal/ZIP entry is disabled for this flow.</Text>
            {paid ? (
              <Text style={[styles.successText, { color: theme.colors.success }]}>Payment details validated successfully for this order.</Text>
            ) : (
              <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>Enter a valid supported card number to unlock the payment action.</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  currencyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  payButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  payButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  backText: {
    fontSize: 13,
    fontWeight: "700",
  },
  summaryBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  summaryKey: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  totalValue: {
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
    textAlign: "right",
  },
  infoText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  successText: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
});