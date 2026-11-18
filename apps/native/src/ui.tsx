import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
export const colors = {
  navy: "#08253d",
  orange: "#d56c12",
  muted: "#687986",
  bg: "#f5f7f9",
  border: "#e2e8ed",
  white: "#fff",
  red: "#aa3030",
};
export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={styles.heading}>{title}</Text>
      {sub && <Text style={styles.subtitle}>{sub}</Text>}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.navy : "white"} />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={20}
              color={secondary ? colors.navy : "white"}
            />
          )}
          <Text
            style={[styles.buttonText, secondary && { color: colors.navy }]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8a98a2"
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Text style={{ color: colors.red, lineHeight: 22 }}>{message}</Text>
      {retry && <Button title="Try again" secondary onPress={retry} />}
    </View>
  );
}
export function Busy() {
  return (
    <View style={{ padding: 50 }}>
      <ActivityIndicator size="large" color={colors.orange} />
    </View>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 20,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
  },
  heading: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.navy,
  },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.muted, marginTop: 8 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.navy,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    fontSize: 16,
    color: colors.navy,
    backgroundColor: "white",
  },
  button: {
    minHeight: 52,
    backgroundColor: colors.navy,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: 14,
    marginVertical: 6,
  },
  secondary: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: "white", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: "white",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  error: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff0ee",
    marginBottom: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 17, color: colors.navy, fontWeight: "600" },
  small: { fontSize: 12, color: colors.muted, lineHeight: 19 },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f4f6",
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 10,
  },
  amount: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.navy,
  },
  link: {
    color: colors.orange,
    fontWeight: "600",
    fontSize: 14,
    paddingVertical: 12,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
});
