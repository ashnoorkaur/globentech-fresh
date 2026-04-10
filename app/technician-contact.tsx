import { useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { sendContactMessage } from "../lib/contact-api";
import { createContactNotification } from "../lib/contact-notifications-api";
import { queueAdminContactAlert } from "../lib/notifications-store";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function TechnicianContactPage() {
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
      const composedMessage = `Name: ${name.trim()}\nEmail: ${email.trim()}\n${orderNumber.trim() ? `Order: ${orderNumber.trim()}\n` : ""}\n${message.trim()}`;
      await sendContactMessage({
        order_number: orderNumber.trim(),
        subject: subject.trim(),
        message: composedMessage,
      });
      try {
        await createContactNotification({
          sender_role: "technician",
          sender_name: name.trim(),
          subject: subject.trim(),
          order_number: orderNumber.trim() || undefined,
        });
      } catch {
        // Temporary fallback during backend rollout.
        queueAdminContactAlert({
          senderRole: "technician",
          senderName: name.trim(),
          subject: subject.trim(),
          orderNumber: orderNumber.trim() || undefined,
        });
      }
      feedback.showSuccess(
        "Message Sent",
        "Your support message was sent successfully.",
      );
      setOrderNumber("");
      setSubject("");
      setMessage("");
    } catch (error) {
      feedback.showError(
        "Send Failed",
        error instanceof Error ? error.message : "Unable to send message.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <RoleContentPage
      title="Contact Us"
      subtitle="If you have questions about your orders, schedules, or our services, please use the form below."
      activeKey="contact-us"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
      role="Technician"
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

          <Pressable
            onPress={submit}
            style={[
              styles.submitBtn,
              {
                backgroundColor: theme.colors.primary,
                opacity: canSubmit && !sending ? 1 : 0.7,
              },
            ]}
          >
            <Text style={styles.submitBtnText}>
              {sending ? "Sending..." : "Send Message"}
            </Text>
          </Pressable>
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
