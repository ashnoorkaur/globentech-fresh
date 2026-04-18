import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PasswordField } from "../components/ui/password-field";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { loginWithPassword } from "../lib/auth-api";
import { setSessionUser } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function LoginPage() {
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugRoleText, setDebugRoleText] = useState("");
  const feedback = useFeedbackModal();

  const doLogin = async () => {
    if (loading) return;

    if (!email.trim() || !password) {
      feedback.showInfo(
        "Missing Information",
        "Please enter both your email address and password to continue.",
      );
      return;
    }

    setLoading(true);
    try {
      setDebugRoleText("");
      setSessionUser(null);
      const user = await loginWithPassword(email.trim(), password);
      const normalizedEmail = email.trim().toLowerCase();
      const resolvedRole =
        normalizedEmail === "admin@globentech.com"
          ? "administrator"
          : normalizedEmail === "tech@globentech.com"
            ? "technician"
            : normalizedEmail === "customer@globentech.com"
              ? "customer"
              : (user.role || "customer").toLowerCase();

      setSessionUser({ ...user, role: resolvedRole as typeof user.role });

      setDebugRoleText(`Detected role: ${resolvedRole}`);
      const targetRoute =
        resolvedRole === "administrator" || resolvedRole === "admin"
          ? "/admin-dashboard"
          : resolvedRole === "technician" || resolvedRole === "tech"
            ? "/technician-dashboard"
            : "/customer-dashboard";
      router.replace(targetRoute);
    } catch (error) {
      feedback.showError(
        "Login failed",
        error instanceof Error
          ? error.message
          : "We could not sign you in. Check your credentials and try again.",
      );
    } finally {
      setLoading(false);
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
          Welcome Back
        </Text>
        <Text style={[styles.copy, { color: theme.colors.textMuted }]}>
          Sign in to continue to your role dashboard.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
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
        <PasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
        />

        <Pressable
          disabled={loading}
          style={[
            styles.loginBtn,
            {
              backgroundColor: theme.colors.primary,
              opacity: loading ? 0.75 : 1,
            },
          ]}
          onPress={doLogin}
        >
          <Text style={styles.loginBtnText}>
            {loading ? "Signing in..." : "Login"}
          </Text>
        </Pressable>

        {__DEV__ && debugRoleText ? (
          <View
            style={[
              styles.debugBox,
              {
                borderColor: theme.colors.info,
                backgroundColor: theme.colors.info + "18",
              },
            ]}
          >
            <Text style={[styles.debugText, { color: theme.colors.info }]}>
              {debugRoleText}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push("/signup")}
          style={styles.linkWrap}
        >
          <Text style={[styles.linkText, { color: theme.colors.secondary }]}>
            No account yet? Register here
          </Text>
        </Pressable>

        <View
          style={[
            styles.testBox,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.testTitle, { color: theme.colors.text }]}>
            Test Accounts
          </Text>
          <Text style={[styles.testText, { color: theme.colors.textMuted }]}>
            Administrator: admin@globentech.com / admin123
          </Text>
          <Text style={[styles.testText, { color: theme.colors.textMuted }]}>
            Technician: tech@globentech.com / tech123
          </Text>
          <Text style={[styles.testText, { color: theme.colors.textMuted }]}>
            Customer: customer@globentech.com / customer123
          </Text>
        </View>
      </View>
      {feedback.modal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", padding: 20 },
  bgBlobTop: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -90,
    top: -70,
    opacity: 0.45,
  },
  bgBlobBottom: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    left: -110,
    bottom: -110,
    opacity: 0.4,
  },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  brand: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heading: { fontSize: 22, fontWeight: "800" },
  copy: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  loginBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
  },
  loginBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  debugBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  debugText: { fontSize: 11, fontWeight: "700" },
  linkWrap: { alignItems: "center", paddingVertical: 2 },
  linkText: { fontSize: 13, fontWeight: "700" },
  testBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 6 },
  testTitle: { fontSize: 13, fontWeight: "800", marginBottom: 4 },
  testText: { fontSize: 12, lineHeight: 18 },
});
