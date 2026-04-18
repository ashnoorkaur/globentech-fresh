import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

export default function IndexPage() {
  const theme = useAppTheme();
  const session = useSessionState();

  if (session.loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href="/login" />;
}
