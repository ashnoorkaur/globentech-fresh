import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set } from "firebase/database";
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
  onConfirm?: () => void;
};

export default function SignUpScreen() {
  const theme = useAppTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
    onConfirm?: () => void,
  ) => {
    setModal({ visible: true, title, message, variant, onConfirm });
  };

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSignUp = async () => {
    if (!name.trim()) {
      showModal("Required Field", "Full name is required.", "error");
      return;
    }
    if (!/^[A-Za-z\s]+$/.test(name.trim())) {
      showModal("Invalid Name", "Name should contain only letters.", "error");
      return;
    }
    if (name.trim().length > 20) {
      showModal("Invalid Name", "Name cannot exceed 20 characters.", "error");
      return;
    }

    if (!email.trim()) {
      showModal("Required Field", "Email address is required.", "error");
      return;
    }
    if (!isValidEmail(email.trim())) {
      showModal(
        "Invalid Email",
        "Please enter a valid email address containing @.",
        "error",
      );
      return;
    }

    if (phone.trim() && !/^\d+$/.test(phone.trim())) {
      showModal(
        "Invalid Phone",
        "Phone number must contain digits only.",
        "error",
      );
      return;
    }

    if (!password) {
      showModal("Required Field", "Password is required.", "error");
      return;
    }
    if (password.length < 6 || password.length > 35) {
      showModal(
        "Invalid Password",
        "Password must be between 6 and 35 characters.",
        "error",
      );
      return;
    }

    if (password !== confirmPassword) {
      showModal("Password Mismatch", "Passwords do not match.", "error");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      const user = userCredential.user;

      await set(ref(db, `users/${user.uid}`), {
        uid: user.uid,
        name: name.trim(),
        email: user.email,
        phone: phone.trim(),
        company: company.trim(),
        address: address.trim(),
        role: "customer",
        createdAt: new Date().toISOString(),
      });

      showModal(
        "Account Created",
        "Your account was created successfully.",
        "success",
        () => {
          router.replace("/login");
        },
      );
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        showModal("Sign Up Failed", "This email is already in use.", "error");
      } else if (error.code === "auth/invalid-email") {
        showModal(
          "Sign Up Failed",
          "Please enter a valid email address.",
          "error",
        );
      } else {
        showModal("Sign Up Failed", error.message, "error");
      }
    } finally {
      setLoading(false);
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
              CREATE ACCOUNT
            </Text>
            <Text style={[styles.title, { color: theme.colors.primary }]}>
              Join GlobenTech
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Create your profile and start booking services.
            </Text>

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Full Name
              </Text>
              <Text style={styles.required}> *</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Enter your full name (max 20 chars)"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={(text) => {
                if (text.length <= 20) setName(text);
              }}
              editable={!loading}
            />

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Email Address
              </Text>
              <Text style={styles.required}> *</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Enter your email (must contain @)"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={(text) => {
                if (text.length <= 60) setEmail(text);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Phone Number
              </Text>
              <Text style={styles.optional}> (optional)</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Digits only, max 15"
              placeholderTextColor="#94A3B8"
              value={phone}
              onChangeText={(text) => {
                const digits = text.replace(/[^\d]/g, "");
                if (digits.length <= 15) setPhone(digits);
              }}
              keyboardType="phone-pad"
              editable={!loading}
            />

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Company Name
              </Text>
              <Text style={styles.optional}> (optional)</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Enter your company name (max 35 chars)"
              placeholderTextColor="#94A3B8"
              value={company}
              onChangeText={(text) => {
                if (text.length <= 35) setCompany(text);
              }}
              editable={!loading}
            />

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Address
              </Text>
              <Text style={styles.optional}> (optional)</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Enter your address (max 45 chars)"
              placeholderTextColor="#94A3B8"
              value={address}
              onChangeText={(text) => {
                if (text.length <= 45) setAddress(text);
              }}
              editable={!loading}
            />

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Password
              </Text>
              <Text style={styles.required}> *</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Enter password (6–35 characters)"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={(text) => {
                if (text.length <= 35) setPassword(text);
              }}
              secureTextEntry
              editable={!loading}
            />

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Confirm Password
              </Text>
              <Text style={styles.required}> *</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Re-enter your password"
              placeholderTextColor="#94A3B8"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.colors.primary },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/login")}
              disabled={loading}
            >
              <Text style={[styles.link, { color: theme.colors.primary }]}>
                Already have an account? Login
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
        onConfirm={() => {
          const callback = modal.onConfirm;
          setModal((prev) => ({
            ...prev,
            visible: false,
            onConfirm: undefined,
          }));
          callback?.();
        }}
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
    borderRadius: 24,
    padding: 24,
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
    fontSize: 14,
    color: "#64748B",
    lineHeight: 21,
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  required: {
    color: "#B42318",
    fontSize: 13,
    fontWeight: "700",
  },
  optional: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
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
  button: {
    backgroundColor: "#1E3A8A",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  link: {
    textAlign: "center",
    marginTop: 18,
    color: "#23408E",
    fontWeight: "600",
  },
});
