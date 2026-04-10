import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import {
    ColorValue,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    ViewStyle,
} from "react-native";
import { useAppTheme } from "../../lib/theme";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "outline"
  | "ghost";
type ButtonSize = "default" | "compact" | "large";

type GradientButtonProps = {
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  colors?: [ColorValue, ColorValue, ...ColorValue[]];
  compact?: boolean;
  /** Style variant for button appearance */
  variant?: ButtonVariant;
  /** Button size (default, compact, large) */
  size?: ButtonSize;
  /** Show loading state */
  loading?: boolean;
  /** Accessibility label for screen readers */
  accessibilityLabel?: string;
};

export function GradientButton({
  onPress,
  children,
  style,
  disabled,
  colors,
  compact = false,
  variant = "primary",
  size = "default",
  loading = false,
  accessibilityLabel,
}: GradientButtonProps) {
  const theme = useAppTheme();
  const isDisabled = disabled || loading;

  // Get colors based on variant
  const getColors = (): [ColorValue, ColorValue, ...ColorValue[]] => {
    if (colors) return colors;

    switch (variant) {
      case "secondary":
        return [theme.colors.secondary, theme.colors.primary];
      case "danger":
        return ["#DC2626", "#B91C1C"];
      case "success":
        return ["#16A34A", "#15803D"];
      case "outline":
      case "ghost":
        return [theme.colors.border, theme.colors.border];
      default:
        return [theme.colors.buttonStart, theme.colors.buttonEnd];
    }
  };

  // Get size styles
  const getSizeStyles = () => {
    switch (size) {
      case "compact":
        return styles.sizeCompact;
      case "large":
        return styles.sizeLarge;
      default:
        return styles.sizeDefault;
    }
  };

  if (variant === "outline" || variant === "ghost") {
    const variantStyle =
      variant === "outline" ? styles.variantOutline : styles.variantGhost;

    return (
      <TouchableOpacity
        style={[
          styles.container,
          getSizeStyles(),
          compact && styles.sizeCompact,
          variantStyle,
          isDisabled && styles.disabled,
          {
            borderColor: theme.colors.border,
          },
          style,
        ]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text
          style={[
            styles.text,
            {
              color:
                variant === "ghost" ? theme.colors.text : theme.colors.border,
            },
          ]}
        >
          {loading ? "..." : children}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient
        colors={getColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          getSizeStyles(),
          compact && styles.sizeCompact,
          isDisabled && styles.disabled,
        ]}
      >
        <Text style={[styles.text, { color: theme.colors.buttonText }]}>
          {loading ? "..." : children}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
  },
  gradient: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3E3C8F",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  // Size variants
  sizeDefault: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  sizeCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sizeLarge: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  // Button variants
  variantOutline: {
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  variantGhost: {
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
