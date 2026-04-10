import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    Pressable,
    StyleProp,
    StyleSheet,
    TextInput,
    TextInputProps,
    TextStyle,
    View,
    ViewStyle,
} from "react-native";
import { useAppTheme } from "../../lib/theme";

type PasswordFieldProps = Omit<
  TextInputProps,
  "secureTextEntry" | "placeholderTextColor" | "style"
> & {
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function PasswordField({
  containerStyle,
  inputStyle,
  ...inputProps
}: PasswordFieldProps) {
  const theme = useAppTheme();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View
      style={[
        styles.wrapper,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.inputBg,
        },
        containerStyle,
      ]}
    >
      <TextInput
        {...inputProps}
        secureTextEntry={!isVisible}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, { color: theme.colors.text }, inputStyle]}
      />
      <Pressable
        onPress={() => setIsVisible((value) => !value)}
        style={styles.eyeButton}
        accessibilityRole="button"
        accessibilityLabel={isVisible ? "Hide password" : "Show password"}
      >
        <Ionicons
          name={isVisible ? "eye-off-outline" : "eye-outline"}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  eyeButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
});
