import { ScrollView, StyleSheet, Text } from "react-native";
import { ProjectFooter } from "../../components/project-footer";
import { useAppTheme } from "../../lib/theme";

export default function CreateOrder() {
  const theme = useAppTheme();

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Create Order
      </Text>
      <Text style={[styles.text, { color: theme.colors.textMuted }]}>
        Create Order page
      </Text>
      <ProjectFooter colors={theme.colors} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  text: { fontSize: 14 },
});
