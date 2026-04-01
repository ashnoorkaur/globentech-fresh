import { router } from "expo-router";
import {
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { get, ref } from "firebase/database";
import { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { FeedbackModal } from "../components/ui/feedback-modal";
import { auth, db } from "../firebase/config";
import { useAppTheme } from "../lib/theme";

type ModalState = {
  visible: boolean;
  title: string;
  message: string;
  variant: "info" | "success" | "error";
};

export default function LoginScreen() {
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: "",
    message: "",
    variant: "info",
  });

  const showModal = (
    title: string,
    message: string,
    variant: "info" | "success" | "error" = "info",
  ) => {
    setModal({ visible: true, title, message, variant });
  };

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const redirectByRole = (role: string) => {
    if (role === "admin") {
      router.replace("/admin-dashboard");
    } else if (role === "technician") {
      router.replace("/technician-dashboard");
    } else {
      router.replace("/customer-dashboard");
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showModal(
        "Missing Information",
        "Please enter email and password.",
        "error",
      );
      return;
    }

    if (!isValidEmail(email.trim())) {
      showModal(
        "Invalid Email",
        "Please enter a valid email address.",
        "error",
      );
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password.trim(),
      );

      const user = userCredential.user;
      const snapshot = await get(ref(db, `users/${user.uid}`));

      if (!snapshot.exists()) {
        showModal("Profile Missing", "User data not found.", "error");
        return;
      }

      const userData = snapshot.val();

      if ((userData.status || "active") !== "active") {
        await signOut(auth);
        showModal(
          "Account Deactivated",
          "This account is currently deactivated. Contact an administrator to regain access.",
          "error",
        );
        return;
      }

      const role = userData.role || "customer";
      redirectByRole(role);
    } catch (error: any) {
      showModal("Login Failed", error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGooglePlaceholder = () => {
    showModal("Coming Soon", "Google Sign-In will be added later.", "info");
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showModal("Email Required", "Enter your email first.", "error");
      return;
    }

    if (!isValidEmail(email.trim())) {
      showModal("Invalid Email", "Enter valid email.", "error");
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      showModal(
        "Success",
        "Password reset link sent to your email.",
        "success",
      );
    } catch (error: any) {
      showModal("Error", error.message, "error");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.bgBubbleTop,
          { backgroundColor: theme.colors.primarySoft },
        ]}
      />
      <View
        style={[
          styles.bgBubbleBottom,
          { backgroundColor: theme.colors.primarySoft },
        ]}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
            <Text
              style={[
                styles.badge,
                {
                  color: theme.colors.primary,
                  backgroundColor: theme.colors.primarySoft,
                },
              ]}
            >
              WELCOME BACK
            </Text>
            <Text style={[styles.title, { color: theme.colors.primary }]}>
              GlobenTech
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Sign in to continue managing service orders.
            </Text>

            <Text style={[styles.label, { color: theme.colors.text }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Email address"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={(text) => {
                if (text.length <= 40) setEmail(text);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={[styles.label, { color: theme.colors.text }]}>
              Password
            </Text>
            <View
              style={[
                styles.passwordWrapper,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
            >
              <TextInput
                style={[styles.passwordInput, { color: theme.colors.text }]}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text
                  style={[styles.showText, { color: theme.colors.primary }]}
                >
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleForgotPassword}
              disabled={resetLoading}
            >
              <Text
                style={[styles.forgotText, { color: theme.colors.primary }]}
              >
                {resetLoading ? "Sending reset link..." : "Forgot Password?"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.loginButton,
                { backgroundColor: theme.colors.primary },
                loading && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.googleButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
              onPress={handleGooglePlaceholder}
            >
              <Text
                style={[styles.googleText, { color: theme.colors.primary }]}
              >
                Continue with Google (Coming Soon)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/signup")}>
              <Text style={[styles.linkText, { color: theme.colors.primary }]}>
                Don’t have an account? Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FeedbackModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        variant={modal.variant}
        onConfirm={() =>
          setModal((prev) => ({
            ...prev,
            visible: false,
          }))
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#E8EFFA",
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    justifyContent: "center",
    flexGrow: 1,
    padding: 20,
    paddingVertical: 28,
  },

  bgBubbleTop: {
    position: "absolute",
    top: -90,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#C7D8F7",
    opacity: 0.45,
  },

  bgBubbleBottom: {
    position: "absolute",
    bottom: -100,
    left: -70,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "#BFD2F5",
    opacity: 0.35,
  },

  card: {
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D5E2F8",
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },

  badge: {
    alignSelf: "flex-start",
    color: "#3159A9",
    backgroundColor: "#E9F0FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1E3A8A",
    marginBottom: 4,
  },

  subtitle: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },

  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: "#CBD8EF",
    backgroundColor: "#F8FAFD",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#0F172A",
    marginBottom: 14,
  },

  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD8EF",
    backgroundColor: "#F8FAFD",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },

  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 13,
  },

  showText: {
    color: "#23408E",
    fontWeight: "600",
    marginLeft: 10,
  },

  forgotText: {
    textAlign: "right",
    color: "#23408E",
    fontWeight: "600",
    marginBottom: 18,
    fontSize: 13,
  },

  loginButton: {
    backgroundColor: "#1E3A8A",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },

  loginButtonDisabled: {
    opacity: 0.7,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  googleButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#CBD8EF",
    backgroundColor: "#F8FAFD",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },

  googleText: {
    color: "#23408E",
    textAlign: "center",
    fontWeight: "600",
  },

  linkText: {
    textAlign: "center",
    marginTop: 18,
    color: "#23408E",
    fontWeight: "600",
  },
});
