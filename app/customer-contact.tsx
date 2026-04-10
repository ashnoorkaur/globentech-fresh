import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { customerMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { fetchSessionUser } from "../lib/auth-api";
import {
    notifyAdminOfEvent,
    submitContactForm,
} from "../lib/contact-api-enhanced";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function CustomerContactPage() {
  const theme = useAppTheme();
  const session = useSessionState();
  const [name, setName] = useState(session.user?.full_name || "");
  const [email, setEmail] = useState(session.user?.email || "");
  const [orderNumber, setOrderNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const feedback = useFeedbackModal();

  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 1 &&
      email.trim().length > 4 &&
      subject.trim().length > 1 &&
      message.trim().length > 4
    );
  }, [name, email, subject, message]);

  const submit = async () => {
    if (!canSubmit) {
      feedback.showInfo(
        "Missing Details",
        "Please fill your name, email, subject, and message before sending.",
      );
      return;
    }

    setSending(true);
    try {
      // Ensure session is still valid before submit to avoid backend 401 loops.
      await fetchSessionUser();

      // Submit the contact form to the backend
      const result = await submitContactForm({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        category: orderNumber.trim() ? "order" : "general",
      });

      // Notify admins about the contact submission
      await notifyAdminOfEvent({
        event_type: "support_request",
        title: `New Support Request: ${subject.trim()}`,
        description: `From: ${name.trim()} (${email.trim()})${orderNumber.trim() ? `\nOrder: ${orderNumber.trim()}` : ""}`,
        user_id: session.user?.id,
        priority: "medium",
      });

      feedback.showSuccess(
        "Message Sent Successfully",
        `Your support ticket (${result.data?.ticket_number || "pending"}) has been received. Our team will respond within 24 hours.`,
      );

      // Reset form
      setOrderNumber("");
      setSubject("");
      setMessage("");
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Unable to send message. Please try again or call support directly.";

      const looksLikeSessionIssue =
        /no active session|unauthorized|401|session/i.test(errorMsg);

      if (looksLikeSessionIssue) {
        feedback.showError(
          "Session Expired",
          "Please log in again, then resend your message.",
        );
        router.replace("/login");
        return;
      }

      feedback.showError("Message Send Failed", errorMsg);
    } finally {
      setSending(false);
    }
  };

  return (
    <RoleContentPage
      title="Contact Us"
      subtitle="If you have questions about your orders, schedules, or our services, please use the form below."
      activeKey="contact-us"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
      role="Customer"
    >
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.label, { color: theme.colors.text }]}>
            Your Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your Name"
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

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Your Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Your Email"
            keyboardType="email-address"
            autoCapitalize="none"
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

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Related Order # (optional)
          </Text>
          <TextInput
            value={orderNumber}
            onChangeText={setOrderNumber}
            placeholder="Related Order # (optional)"
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

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Subject
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
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

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Message
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Message"
            multiline
            numberOfLines={5}
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              styles.messageInput,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
              },
            ]}
          />

          <GradientButton
            onPress={submit}
            disabled={!canSubmit || sending}
            loading={sending}
            variant="primary"
          >
            {sending ? "Sending..." : "Send Message"}
          </GradientButton>
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
          <Text style={[styles.detailsTitle, { color: theme.colors.text }]}>
            Contact Details
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            Laboratory: GlobenTech
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            Email: support@globentech.com
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            Phone: +1 (555) 123-4567
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            Address:
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            123 Research Park Way
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            Calgary, AB
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textMuted }]}>
            Canada
          </Text>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            Our team is available during regular business hours to assist with
            order questions, scheduling, and general inquiries.
          </Text>
        </View>
      </ScrollView>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  label: { fontSize: 12, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  messageInput: { minHeight: 110, textAlignVertical: "top" },
  submitBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  submitBtnText: { color: "#fff", fontWeight: "800" },
  detailsTitle: { fontSize: 18, fontWeight: "800" },
  detailsText: { fontSize: 13, lineHeight: 20, fontWeight: "600" },
  footerText: { fontSize: 12, lineHeight: 18, marginTop: 8 },
});
