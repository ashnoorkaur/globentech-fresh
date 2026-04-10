import { useEffect, useRef } from "react";
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useAppTheme } from "../../lib/theme";

type FeedbackVariant = "info" | "success" | "error";

type FeedbackModalProps = {
  visible: boolean;
  title: string;
  message: string;
  variant?: FeedbackVariant;
  confirmText?: string;
  cancelText?: string;
  onCancel?: () => void;
  onConfirm: () => void;
};

const variantConfig: Record<
  FeedbackVariant,
  { icon: string; iconBg: string; iconText: string }
> = {
  info: {
    icon: "i",
    iconBg: "#E6EEFF",
    iconText: "#1E3A8A",
  },
  success: {
    icon: "✓",
    iconBg: "#E7F7ED",
    iconText: "#1F7A3D",
  },
  error: {
    icon: "!",
    iconBg: "#FDECEC",
    iconText: "#B42318",
  },
};

export function FeedbackModal({
  visible,
  title,
  message,
  variant = "info",
  confirmText = "OK",
  cancelText,
  onCancel,
  onConfirm,
}: FeedbackModalProps) {
  const theme = useAppTheme();
  const cfg = variantConfig[variant];
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      cardAnim.setValue(0);
      return;
    }

    Animated.spring(cardAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 190,
      mass: 0.9,
    }).start();
  }, [visible, cardAnim]);

  const scale = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const opacity = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const translateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  const overlayBg = theme.isDark
    ? "rgba(15, 23, 42, 0.7)"
    : "rgba(15, 23, 42, 0.5)";

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onConfirm}
    >
      <View style={[styles.overlay, { backgroundColor: overlayBg }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onConfirm} />

        <Animated.View
          style={[
            styles.dialog,
            {
              opacity,
              transform: [{ scale }, { translateY }],
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: cfg.iconBg }]}>
            <Text style={[styles.icon, { color: cfg.iconText }]}>
              {cfg.icon}
            </Text>
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.message, { color: theme.colors.textMuted }]}>
            {message}
          </Text>

          <View style={styles.actionsRow}>
            {!!cancelText && !!onCancel && (
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.isDark
                      ? theme.colors.surfaceMuted
                      : "#F8FAFD",
                  },
                ]}
                onPress={onCancel}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: theme.colors.primary,
                },
                cancelText ? styles.buttonSplit : styles.buttonFull,
              ]}
              onPress={onConfirm}
            >
              <Text style={styles.buttonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 9,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  icon: {
    fontSize: 22,
    fontWeight: "800",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonFull: {
    width: "100%",
  },
  buttonSplit: {
    flex: 1,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
