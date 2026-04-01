import { StyleSheet, Text, View } from "react-native";

type FooterColors = {
  surface: string;
  border: string;
  text: string;
  textMuted: string;
};

type ProjectFooterProps = {
  colors: FooterColors;
};

export function ProjectFooter({ colors }: ProjectFooterProps) {
  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.brand, { color: colors.text }]}>GlobenTech</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Laboratory Order Management System
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Project Information
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          Course: CPSY 301-D
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          Phase 3 Prototype
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          SAIT - 2025
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Client
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          GMJ Global Energy
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          Astra Agus Pramana
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Team Members
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          Bhavya Bhavya, Evan Di Placido,
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          Ahmad Fakhry, Gaganpreet Kaur,
        </Text>
        <Text style={[styles.line, { color: colors.textMuted }]}>
          Ashnoor Kaur, Justice Mazerolle, Ravneet Kaur
        </Text>
      </View>

      <Text style={[styles.copyright, { color: colors.textMuted }]}>
        © 2026 GlobenTech. School Project - All rights reserved.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
  },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  line: {
    fontSize: 13,
    lineHeight: 20,
  },
  copyright: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
});
