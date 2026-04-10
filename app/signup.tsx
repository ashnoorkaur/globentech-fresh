import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PasswordField } from "../components/ui/password-field";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { registerAccount } from "../lib/auth-api";
import { useAppTheme } from "../lib/theme";

export default function SignupPage() {
  const theme = useAppTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const feedback = useFeedbackModal();

  const offensiveWords = useMemo(
    () => [
      "fuck",
      "fucking",
      "shit",
      "bitch",
      "bastard",
      "cunt",
      "dick",
      "pussy",
      "nigger",
      "nigga",
      "faggot",
      "fag",
      "retard",
      "whore",
      "slut",
      "piss",
      "cock",
      "asshole",
      "motherfucker",
      "wanker",
      "twat",
      "prick",
    ],
    [],
  );

  const hasOffensive = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return offensiveWords.some((word) =>
      new RegExp(`\\b${word}\\b`, "i").test(normalized),
    );
  };

  const validate = () => {
    if (!fullName.trim() || !email.trim() || !password) {
      return "Please fill in all required fields";
    }
    if (fullName.trim().length > 20) {
      return "Full name must be 20 characters or less";
    }
    if (email.trim().length > 30) {
      return "Email address must be 30 characters or less";
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return "Please enter a valid email address (must contain @)";
    }
    if (phone.trim() && !/^[0-9]{1,15}$/.test(phone.trim())) {
      return "Phone number must contain digits only (max 15)";
    }
    if (companyName.trim() && companyName.trim().length > 35) {
      return "Company name must be 35 characters or less";
    }
    if (address.trim() && address.trim().length > 45) {
      return "Address must be 45 characters or less";
    }
    if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters long";
    }
    if (password.length > 35) {
      return "Password must be 35 characters or less";
    }
    if (
      hasOffensive(fullName) ||
      hasOffensive(companyName) ||
      hasOffensive(address)
    ) {
      return "Offensive or inappropriate language is not allowed";
    }
    return "";
  };

  const submit = async () => {
    const error = validate();
    if (error) {
      feedback.showInfo("Please Check Your Details", error);
      return;
    }

    setSubmitting(true);
    try {
      await registerAccount({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
        phone: phone.trim(),
        company_name: companyName.trim(),
        address: address.trim(),
      });

      feedback.showSuccess(
        "Account Created",
        "Your account is ready. You can log in now.",
      );
      router.replace("/login");
    } catch (error) {
      feedback.showError(
        "Registration failed",
        error instanceof Error
          ? error.message
          : "We could not complete your registration. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.page, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.bgBlobTop,
          { backgroundColor: theme.colors.backgroundDesignA },
        ]}
      />
      <View
        style={[
          styles.bgBlobBottom,
          { backgroundColor: theme.colors.backgroundDesignB },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
          <Text style={[styles.brand, { color: theme.colors.primary }]}>
            GlobenTech
          </Text>
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            Create Account
          </Text>
          <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
            Create your account and continue to login.
          </Text>

          <View
            style={[
              styles.section,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Basic Information
            </Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full Name* (max 20)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
              maxLength={20}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email* (max 30)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={30}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone (digits only, max 15)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
              keyboardType="number-pad"
              maxLength={15}
            />
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Company Name (max 35)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
              maxLength={35}
            />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Address (max 45)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                styles.textarea,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
              maxLength={45}
              multiline
            />
          </View>

          <View
            style={[
              styles.section,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Security
            </Text>

            <PasswordField
              value={password}
              onChangeText={setPassword}
              placeholder="Password* (6-35)"
              maxLength={35}
            />

            <PasswordField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm Password*"
              maxLength={35}
            />

            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              Passwords must match and be 6-35 characters.
            </Text>
          </View>

          <Pressable
            style={[
              styles.registerBtn,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={submit}
          >
            <Text style={styles.registerBtnText}>
              {submitting ? "Registering..." : "Register"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/login")}
            style={styles.linkWrap}
          >
            <Text style={[styles.linkText, { color: theme.colors.secondary }]}>
              Already have an account? Login here
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      {feedback.modal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bgBlobTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -95,
    top: -90,
    opacity: 0.44,
  },
  bgBlobBottom: {
    position: "absolute",
    width: 290,
    height: 290,
    borderRadius: 145,
    left: -120,
    bottom: -120,
    opacity: 0.38,
  },
  scrollContent: { padding: 20, paddingTop: 32, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  brand: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heading: { fontSize: 24, fontWeight: "800" },
  copy: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  section: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  hint: { fontSize: 11, fontWeight: "700", marginTop: -2 },
  registerBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
  },
  registerBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  linkWrap: { alignItems: "center", paddingVertical: 4 },
  linkText: { fontSize: 13, fontWeight: "700" },
});
