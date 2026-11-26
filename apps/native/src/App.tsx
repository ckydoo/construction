import { useCaptcha } from './useCaptcha';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  AppState,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, useFocusEffect } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  api,
  auth,
  configurationError,
  orgPath,
  origin,
  receiptKey,
  token,
} from "./client";
import {
  canCreate,
  canUpdate,
  canUpload,
  canReceive,
  localDate,
  minorUnits,
  money,
  priceLines,
  sections,
  validDate,
  visibleSections,
  writable,
  type Line,
  type Membership,
  type Meta,
  type RecordRow,
} from "./core";
import {
  Busy,
  Button,
  Card,
  colors,
  ErrorBox,
  Heading,
  Input,
  Screen,
  styles,
} from "./ui";

type Workspace = {
  org: string;
  meta: Meta;
  userId: string;
  reload: () => void;
  switchOrg: () => void;
  logout: () => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);
function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("No workspace");
  return value;
}
const Stack = createNativeStackNavigator(),
  Tabs = createBottomTabNavigator();
const describe = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
const displayStatus = (status: string) =>
  String(status || "")
    .replace(/_/g, " ")
    .toLowerCase();

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [restoring, setRestoring] = useState(true);
  const [members, setMembers] = useState<Membership[]>([]),
    [org, setOrg] = useState(""),
    [meta, setMeta] = useState<Meta | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [blocked, setBlocked] = useState(false);
  const [generation, setGeneration] = useState(0),
    [sessionRetry, setSessionRetry] = useState(0);
  useEffect(() => {
    if (!auth) {
      setRestoring(false);
      return;
    }
    auth.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) Alert.alert("Session could not be restored", error.message);
        setSession(data.session);
      })
      .catch((error) => {
        Alert.alert("Session could not be restored", describe(error));
        setSession(null);
      })
      .finally(() => setRestoring(false));
    const { data } = auth.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        auth?.auth.startAutoRefresh();
        setGeneration((n) => n + 1);
      } else auth?.auth.stopAutoRefresh();
    });
    auth.auth.startAutoRefresh();
    return () => {
      data.subscription.unsubscribe();
      subscription.remove();
      auth?.auth.stopAutoRefresh();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setMeta(null);
    setMembers([]);
    setOrg("");
    setError("");
    setBlocked(false);
    if (!session) return;
    setLoading(true);
    api("/api/auth/mobile-session")
      .then((data) => {
        if (!active) return;
        if (data.temporaryPassword || !data.onboarded) {
          setBlocked(true);
          return;
        }
        setMembers(data.memberships);
        if (data.memberships.length === 1) setOrg(data.memberships[0].orgSlug);
      })
      .catch((e) => {
        if (active) setError(describe(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id, sessionRetry]);
  useEffect(() => {
    let active = true;
    if (!org || !session) return;
    setLoading(true);
    setError("");
    api<Meta>(orgPath(org, "meta"))
      .then((data) => {
        if (active) setMeta(data);
      })
      .catch((e) => {
        if (active) {
          setMeta(null);
          setError(describe(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org, session?.user.id, generation]);
  const logout = async () => {
    try {
      const result = await auth?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
      setSession(null);
      setMeta(null);
      setOrg("");
      setMembers([]);
    } catch (e) {
      Alert.alert("Could not sign out", describe(e));
    }
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {configurationError ? (
        <SafeAreaView style={styles.screen}>
          <Screen>
            <Heading title="Build configuration needed" />
            <ErrorBox message={configurationError} />
            <Text style={styles.subtitle}>
              Add the public API and Supabase settings before building this app.
              Never include a service-role key.
            </Text>
          </Screen>
        </SafeAreaView>
      ) : restoring ? (
        <Busy />
      ) : !session ? (
        <Login />
      ) : blocked ? (
        <SafeAreaView style={styles.screen}>
          <Screen>
            <Heading
              title="Finish your account setup"
              sub="Complete onboarding, invitation acceptance or your temporary password change in the MYLA website first."
            />
            <Button title="Open MYLA" onPress={() => Linking.openURL(origin)} />
            <Button title="Sign out" secondary onPress={logout} />
          </Screen>
        </SafeAreaView>
      ) : !org ? (
        <SafeAreaView style={styles.screen}>
          <Screen>
            <Heading
              title="Choose your workspace"
              sub="One account. Your existing MYLA businesses."
            />
            {loading ? (
              <Busy />
            ) : error ? (
              <ErrorBox
                message={error}
                retry={() => setSessionRetry((n) => n + 1)}
              />
            ) : members.length ? (
              members.map((m) => (
                <Button
                  key={m.orgSlug}
                  title={m.orgName}
                  secondary
                  onPress={() => {
                    setMeta(null);
                    setOrg(m.orgSlug);
                  }}
                />
              ))
            ) : (
              <Text style={styles.subtitle}>
                No workspace is linked to this account. Ask your administrator
                for an invitation.
              </Text>
            )}
            <Button title="Sign out" secondary onPress={logout} />
          </Screen>
        </SafeAreaView>
      ) : !meta ? (
        <SafeAreaView style={styles.screen}>
          <Screen>
            {loading ? (
              <Busy />
            ) : (
              <ErrorBox
                message={error || "Workspace unavailable."}
                retry={() => setGeneration((n) => n + 1)}
              />
            )}
            <Button title="Sign out" secondary onPress={logout} />
          </Screen>
        </SafeAreaView>
      ) : meta.billing?.access === false ? (
        <SafeAreaView style={styles.screen}>
          <Screen>
            <Heading
              title="Workspace access is paused"
              sub="Ask your owner to review the subscription. Your data has not been deleted."
            />
            <Button
              title="Open billing on the web"
              onPress={() =>
                Linking.openURL(`${origin}/${encodeURIComponent(org)}/billing`)
              }
            />
            <Button title="Sign out" secondary onPress={logout} />
          </Screen>
        </SafeAreaView>
      ) : (
        <WorkspaceContext.Provider
          value={{
            org,
            meta,
            userId: session.user.id,
            reload: () => setGeneration((n) => n + 1),
            switchOrg: () => {
              setMeta(null);
              setOrg("");
            },
            logout,
          }}
        >
          <NavigationContainer key={`${session.user.id}:${org}`}>
            <Stack.Navigator
              screenOptions={{
                headerShadowVisible: false,
                headerTintColor: colors.navy,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen
                name="Everyday"
                component={MainTabs}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="List"
                component={RecordList}
                options={({ route }: any) => ({
                  title:
                    sections.find((s) => s.id === route.params.resource)
                      ?.label || "Records",
                })}
              />
              <Stack.Screen
                name="Detail"
                component={Detail}
                options={{ title: "Details" }}
              />
              <Stack.Screen
                name="Create"
                component={CreateRecord}
                options={{ title: "New record" }}
              />
              <Stack.Screen
                name="Payment"
                component={Payment}
                options={{ title: "Record payment" }}
              />
              <Stack.Screen
                name="Progress"
                component={Progress}
                options={{ title: "Update progress" }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </WorkspaceContext.Provider>
      )}
    </SafeAreaProvider>
  );
}
function Login() {
  const {completeCaptcha,challenge} = useCaptcha();
  const loginInFlight = useRef(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login() {
    if (loginInFlight.current || !email.trim() || !password) return;
    loginInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const captchaToken = await completeCaptcha();
      const { error } = await auth!.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
        options: { captchaToken },
      });
      if (error) throw error;
    } catch (e) {
      setError(describe(e));
    } finally {
      setPassword("");
      loginInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      {challenge}
      <Screen>
        <View style={{ paddingTop: 55, paddingBottom: 45 }}>
          <Text style={{ fontSize: 36, fontWeight: "800", color: colors.navy }}>
            MYLA<Text style={{ color: colors.orange }}>.</Text>
          </Text>
          <Text style={[styles.small, { letterSpacing: 3, marginTop: 6 }]}>
            EVERYDAY
          </Text>
        </View>
        <Heading
          title="Welcome back."
          sub="Your jobs, quotations and money. One simple place."
        />
        {!!error && <ErrorBox message={error} />}
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          editable={!busy}
          keyboardType="email-address"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!busy}
          autoCapitalize="none"
          autoComplete="current-password"
          onSubmitEditing={login}
        />
        <Button
          title="Sign in"
          onPress={login}
          busy={busy}
          disabled={!email || !password}
        />
        <Button
          title="Password help / account setup"
          secondary
          onPress={() => Linking.openURL(origin + "/login")}
        />
        <Text style={[styles.small, { marginTop: 18 }]}>
          Use your existing MYLA account. A quick security check runs inside the
          app before sign-in. Browser verification is available if needed.
          An internet connection is required.
        </Text>
      </Screen>
    </SafeAreaView>
  );
}
function MainTabs() {
  const { meta } = useWorkspace();
  const choices = visibleSections(meta);
  const main = [
    ...choices.filter((s) =>
      ["projects", "estimates", "arInvoices"].includes(s.id),
    ),
    ...choices.filter((s) => ["tasks"].includes(s.id)),
  ].slice(0, 3);
  const { width } = useWindowDimensions();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: "MYLA Everyday",
        headerTintColor: colors.navy,
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        tabBarPosition: width >= 900 ? "left" : "bottom",
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={Home}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      {main.map((s) => (
        <Tabs.Screen
          key={s.id}
          name={s.label}
          component={RecordList}
          initialParams={{ resource: s.id }}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={s.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
      <Tabs.Screen
        name="More"
        component={More}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}
function Home({ navigation }: any) {
  const { meta, reload } = useWorkspace();
  const { width } = useWindowDimensions();
  const available = visibleSections(meta);
  const actions = available.filter(
    (s) =>
      ["clients", "projects", "estimates", "arInvoices"].includes(s.id) &&
      canCreate(meta, s.id),
  );
  return (
    <Screen>
      <Text
        style={[
          styles.small,
          { letterSpacing: 2, color: colors.orange, marginBottom: 12 },
        ]}
      >
        {meta.org.name.toUpperCase()}
      </Text>
      <Heading
        title="Let’s get to work."
        sub="One job, one step at a time. What would you like to do?"
      />
      {meta.billing?.readOnly && (
        <ErrorBox message="This workspace is read-only. Ask your owner to review billing." />
      )}
      <View
        style={{
          flexDirection: width > 650 ? "row" : "column",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {actions.map((s, i) => (
          <Pressable
            accessibilityRole="button"
            key={s.id}
            onPress={() => navigation.navigate("Create", { resource: s.id })}
            style={[
              styles.card,
              {
                minHeight: 100,
                width: width > 650 ? "48%" : "100%",
                backgroundColor: i === 0 ? colors.navy : "white",
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
              },
            ]}
          >
            <Ionicons
              name={s.icon}
              size={27}
              color={i === 0 ? "white" : colors.orange}
            />
            <Text
              style={[
                styles.title,
                { flex: 1, color: i === 0 ? "white" : colors.navy },
              ]}
            >
              {s.action}
            </Text>
            <Ionicons
              name="add"
              size={18}
              color={i === 0 ? "white" : colors.navy}
            />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, { marginTop: 20 }]}>Your everyday work</Text>
      {available.map((s) => (
        <Pressable
          accessibilityRole="button"
          key={s.id}
          onPress={() => navigation.navigate("List", { resource: s.id })}
        >
          <Card>
            <View style={styles.row}>
              <Ionicons name={s.icon} size={22} color={colors.muted} />
              <Text style={[styles.title, { flex: 1 }]}>{s.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
          </Card>
        </Pressable>
      ))}
      {!available.length && (
        <Text style={styles.subtitle}>
          Ask your administrator to enable the sections you need.
        </Text>
      )}
      <Button title="Refresh workspace access" secondary onPress={reload} />
    </Screen>
  );
}
function More({ navigation }: any) {
  const { meta, org, logout, switchOrg } = useWorkspace();
  return (
    <Screen>
      <Heading title="Your app" sub={meta.org.name} />
      {visibleSections(meta).map((s) => (
        <Button
          key={s.id}
          title={s.label}
          secondary
          icon={s.icon}
          onPress={() => navigation.navigate("List", { resource: s.id })}
        />
      ))}
      <View style={styles.divider} />
      <Button title="Switch workspace" secondary onPress={switchOrg} />
      <Button
        title="Reports & full workspace ↗"
        secondary
        onPress={() =>
          Linking.openURL(`${origin}/${encodeURIComponent(org)}/dashboard`)
        }
      />
      <Button title="Sign out" secondary onPress={logout} />
      <Text style={[styles.small, { marginTop: 16 }]}>
        MYLA Everyday · Native Android preview 0.1.0. Online only. Camera
        uploads and payments use your real workspace records. No offline queue.
      </Text>
    </Screen>
  );
}

function RecordList({ route, navigation }: any) {
  const { org, meta } = useWorkspace();
  const resource = route.params.resource as string;
  const section = visibleSections(meta).find((s) => s.id === resource);
  const [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!section) return;
      setBusy(true);
      setError("");
      setData(null);
      api(
        orgPath(
          org,
          `records/${resource}?${new URLSearchParams({ q: query, page: String(page), pageSize: "20", sort: "updatedAt", dir: "desc" })}`,
        ),
      )
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(describe(e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [org, resource, query, page, revision, !!section]),
  );
  if (!section)
    return (
      <Screen>
        <ErrorBox message="This section is disabled or outside your permissions." />
      </Screen>
    );
  return (
    <Screen scroll={false}>
      <FlatList
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        data={data?.rows || []}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={() => setRevision((n) => n + 1)}
            tintColor={colors.orange}
          />
        }
        ListHeaderComponent={
          <>
            <Heading title={section.label} />
            <Input
              label={`Search ${section.label.toLowerCase()}`}
              value={q}
              onChangeText={setQ}
              placeholder="Name or number"
            />
            {canCreate(meta, resource) &&
              ["clients", "projects", "estimates", "arInvoices"].includes(
                resource,
              ) && (
                <Button
                  title={section.action}
                  onPress={() => navigation.navigate("Create", { resource })}
                />
              )}
            {!!error && (
              <ErrorBox
                message={error}
                retry={() => setRevision((n) => n + 1)}
              />
            )}
          </>
        }
        ListEmptyComponent={
          !busy && !error ? (
            <Card>
              <Text style={styles.title}>
                {query ? "No matches found" : "Nothing here yet"}
              </Text>
              <Text style={styles.subtitle}>
                {query
                  ? "Try another name or number."
                  : "Your saved records will appear here."}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("Detail", { resource, id: item.id })
            }
          >
            <Card>
              <Text style={styles.small}>{item.number}</Text>
              <Text style={[styles.title, { marginTop: 5 }]}>
                {item.title || item.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={styles.pill}>
                  <Text style={styles.small}>{displayStatus(item.status)}</Text>
                </View>
                {["estimates", "arInvoices", "payments"].includes(resource) && (
                  <Text style={[styles.label, { marginTop: 10 }]}>
                    {money(item.total ?? item.amount, item.currency)}
                  </Text>
                )}
                {resource === "projects" && (
                  <Text style={styles.small}>
                    {Number(item.progress) || 0}% complete
                  </Text>
                )}
              </View>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          data?.pages > 1 ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button
                title="Previous"
                secondary
                disabled={page <= 1}
                onPress={() => setPage((p) => p - 1)}
              />
              <Text style={styles.small}>
                {page} / {data.pages}
              </Text>
              <Button
                title="Next"
                secondary
                disabled={page >= data.pages}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
function Detail({ route, navigation }: any) {
  const { org, meta } = useWorkspace();
  const { resource, id } = route.params;
  const allowed = !!visibleSections(meta).find((s) => s.id === resource);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [uploading, setUploading] = useState(false),
    [sharing, setSharing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!allowed) return;
      setBusy(true);
      setData(null);
      setError("");
      api(orgPath(org, `records/${resource}/${encodeURIComponent(id)}`))
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(describe(e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [org, resource, id, refresh, allowed]),
  );
  const row = data?.row;
  async function photo(camera: boolean) {
    if (uploading) return;
    try {
      setUploading(true);
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow camera or photo access in Android settings to add a photo.",
        );
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            quality: 0.7,
            mediaTypes: ["images"],
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            mediaTypes: ["images"],
          });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 12 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 12 MB.");
      const form = new FormData();
      form.append("recordId", id);
      form.append("resource", resource);
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName || `site-photo-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      } as any);
      const response = await fetch(origin + orgPath(org, "files"), {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
        body: form,
      });
      if (!response.ok)
        throw new Error(
          "Upload was not confirmed. Refresh the file list before trying again.",
        );
      setRefresh((n) => n + 1);
      Alert.alert("Photo added");
    } catch (e) {
      Alert.alert("Could not add photo", describe(e));
    } finally {
      setUploading(false);
    }
  }
  async function share(path: string, name: string, mime = "application/pdf") {
    if (sharing) return;
    setSharing(true);
    const file =
      FileSystem.cacheDirectory + name.replace(/[^a-zA-Z0-9._-]/g, "_");
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Sharing is unavailable on this device.");
      const result = await FileSystem.downloadAsync(origin + path, file, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (result.status !== 200)
        throw new Error("This file could not be downloaded.");
      await Sharing.shareAsync(result.uri, {
        mimeType: mime,
        dialogTitle: "Share from MYLA",
      });
    } catch (e) {
      Alert.alert("Could not share", describe(e));
    } finally {
      await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
      setSharing(false);
    }
  }
  if (!allowed)
    return (
      <Screen>
        <ErrorBox message="You cannot access this section." />
      </Screen>
    );
  return (
    <Screen>
      {busy && !row ? (
        <Busy />
      ) : error ? (
        <ErrorBox message={error} retry={() => setRefresh((n) => n + 1)} />
      ) : row ? (
        <>
          <Text style={styles.small}>{row.number}</Text>
          <Heading title={row.title || row.name} />
          <View style={styles.pill}>
            <Text style={styles.small}>{displayStatus(row.status)}</Text>
          </View>
          {["estimates", "arInvoices", "payments"].includes(resource) && (
            <View style={{ marginVertical: 24 }}>
              <Text style={styles.small}>Total</Text>
              <Text style={styles.amount}>
                {money(row.total ?? row.amount, row.currency)}
              </Text>
              {resource === "arInvoices" && (
                <Text style={styles.subtitle}>
                  Still to pay:{" "}
                  {money(
                    Math.max(
                      0,
                      Number(row.total || 0) - Number(row.amountPaid || 0),
                    ),
                    row.currency,
                  )}
                </Text>
              )}
            </View>
          )}
          {resource === "arInvoices" &&
            canReceive(meta) &&
            ["ISSUED", "OVERDUE", "PARTIALLY_PAID"].includes(row.status) && (
              <Button
                title="Record payment"
                icon="cash-outline"
                onPress={() => navigation.navigate("Payment", { invoice: row })}
              />
            )}
          {["projects", "tasks"].includes(resource) &&
            canUpdate(meta, resource) && (
              <Button
                title="Update progress"
                icon="checkmark-circle-outline"
                onPress={() =>
                  navigation.navigate("Progress", { resource, row })
                }
              />
            )}
          {["estimates", "arInvoices"].includes(resource) &&
            meta.permissions.capabilities.includes("exports") && (
              <Button
                title="Download & share PDF"
                secondary
                busy={sharing}
                onPress={() =>
                  share(
                    orgPath(org, `pdf/${resource}/${id}`),
                    `${row.number || "document"}.pdf`,
                  )
                }
              />
            )}
          <Card>
            {[
              ["Location", row.location],
              ["Progress", row.progress != null ? `${row.progress}%` : null],
              ["Due date", row.dueDate],
              ["Phone", row.phone],
              ["Email", row.email],
              ["Scope / notes", row.scope || row.notes],
            ]
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([label, value]) => (
                <View key={label} style={{ marginBottom: 14 }}>
                  <Text style={styles.small}>{label}</Text>
                  <Text style={[styles.title, { fontSize: 15, marginTop: 4 }]}>
                    {String(value)}
                  </Text>
                </View>
              ))}
            {row.clientId && meta.permissions.read.includes("clients") && (
              <Reference resource="clients" id={row.clientId} label="Client" />
            )}
            {row.projectId && meta.permissions.read.includes("projects") && (
              <Reference resource="projects" id={row.projectId} label="Job" />
            )}
          </Card>
          {Array.isArray(row.items) &&
            row.items.map((line: any, i: number) => (
              <Card key={i}>
                <Text style={styles.title}>{line.description}</Text>
                <Text style={styles.subtitle}>
                  {line.qty} {line.unit} × {money(line.unitPrice, row.currency)}
                </Text>
                <Text style={styles.label}>
                  {money(line.total, row.currency)}
                </Text>
              </Card>
            ))}
          <Text style={[styles.label, { marginTop: 20 }]}>Photos & files</Text>
          {(data.files || []).map((f: any) => (
            <Button
              key={f.id}
              title={f.fileName}
              secondary
              icon="attach-outline"
              disabled={sharing}
              onPress={() =>
                share(
                  orgPath(org, `files/${f.id}`),
                  f.fileName,
                  f.mime || "application/octet-stream",
                )
              }
            />
          ))}
          {canUpload(meta, resource) && (
            <>
              <Button
                title="Take a site photo"
                icon="camera-outline"
                busy={uploading}
                onPress={() => photo(true)}
              />
              <Button
                title="Choose a photo"
                secondary
                disabled={uploading}
                onPress={() => photo(false)}
              />
            </>
          )}
          <Text style={styles.small}>
            Stay online until uploads finish. Maximum 12 MB per file.
          </Text>
          <Button
            title="Refresh details"
            secondary
            onPress={() => setRefresh((n) => n + 1)}
          />
        </>
      ) : null}
    </Screen>
  );
}
function Reference({
  resource,
  id,
  label,
}: {
  resource: string;
  id: string;
  label: string;
}) {
  const { org } = useWorkspace();
  const [name, setName] = useState("Loading…");
  useEffect(() => {
    let active = true;
    api(
      orgPath(
        org,
        `records/${resource}?${new URLSearchParams({ mode: "refs", ids: id })}`,
      ),
    )
      .then((d) => {
        if (active)
          setName(
            d.options?.find((o: any) => o.value === id)?.label || "Unavailable",
          );
      })
      .catch(() => {
        if (active) setName("Unavailable");
      });
    return () => {
      active = false;
    };
  }, [org, resource, id]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.small}>{label}</Text>
      <Text style={styles.title}>{name}</Text>
    </View>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <Button
        secondary
        title={options.find((o) => o.value === value)?.label || "Choose…"}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.screen}>
          <Screen>
            <Heading title={label} />
            {options.map((o) => (
              <Button
                key={o.value}
                title={o.label}
                secondary
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              />
            ))}
            <Button title="Cancel" onPress={() => setOpen(false)} />
          </Screen>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
function ReferencePicker({
  label,
  resource,
  value,
  onChange,
}: {
  label: string;
  resource: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { org, meta } = useWorkspace();
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [options, setOptions] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed =
    meta.config.resources.includes(resource) &&
    meta.permissions.read.includes(resource);
  useEffect(() => {
    let active = true;
    if (!open || !allowed) return;
    setBusy(true);
    setError("");
    const t = setTimeout(
      () =>
        api(
          orgPath(
            org,
            `records/${resource}?${new URLSearchParams({ mode: "refs", limit: "25", q })}`,
          ),
        )
          .then((d) => {
            if (active) setOptions(d.options || []);
          })
          .catch((e) => {
            if (active) setError(describe(e));
          })
          .finally(() => {
            if (active) setBusy(false);
          }),
      300,
    );
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, q, allowed, org, resource]);
  if (!allowed)
    return (
      <ErrorBox
        message={`${label} selection is unavailable. Ask your administrator for access.`}
      />
    );
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <Button
        title={value ? selected || "Selected" : "Choose…"}
        secondary
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.screen}>
          <Screen>
            <Heading title={`Choose ${label.toLowerCase()}`} />
            <Input
              label="Search by name or number"
              value={q}
              onChangeText={setQ}
            />
            {busy ? (
              <Busy />
            ) : error ? (
              <ErrorBox message={error} />
            ) : options.length ? (
              options.map((o) => (
                <Button
                  key={o.value}
                  secondary
                  title={o.label}
                  onPress={() => {
                    onChange(o.value);
                    setSelected(o.label);
                    setOpen(false);
                  }}
                />
              ))
            ) : (
              <Text style={styles.subtitle}>
                No matches. Add the record first or search for another name.
              </Text>
            )}
            <Text style={styles.small}>
              Showing up to 25 matches. Search to narrow the list.
            </Text>
            <Button title="Cancel" onPress={() => setOpen(false)} />
          </Screen>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function CreateRecord({ route, navigation }: any) {
  const { org, meta } = useWorkspace();
  const resource = route.params.resource;
  const section = sections.find((s) => s.id === resource);
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [location, setLocation] = useState(""),
    [clientId, setClient] = useState(""),
    [projectId, setProject] = useState(""),
    [scope, setScope] = useState(""),
    [currency, setCurrency] = useState(meta.org.baseCurrency || "USD");
  const [lines, setLines] = useState<Line[]>([
      { description: "", qty: "1", rate: "", unit: "" },
    ]),
    [markup, setMarkup] = useState("0"),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [due, setDue] = useState(localDate());
  const inFlight = useRef(false);
  const financial = ["estimates", "arInvoices"].includes(resource);
  const [dirty, setDirty] = useState(false);
  const saved = useRef(false);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e: any) => {
        if (saved.current || !dirty) return;
        e.preventDefault();
        if (inFlight.current) return;
        Alert.alert(
          "Leave without saving?",
          "Your changes have not been saved.",
          [
            { text: "Keep editing", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                saved.current = true;
                navigation.dispatch(e.data.action);
              },
            },
          ],
        );
      }),
    [navigation, dirty],
  );
  const change = (setter: (v: string) => void) => (v: string) => {
    setDirty(true);
    setter(v);
  };
  let pricing: ReturnType<typeof priceLines> | null = null;
  try {
    pricing = priceLines(lines, resource === "estimates" ? markup : "0");
  } catch {}
  const taxRate =
    resource === "arInvoices" && meta.config.tax?.enabled
      ? Number(meta.config.tax.rate) || 0
      : 0;
  const total = pricing
    ? Math.round((pricing.total * (1 + taxRate / 100) + Number.EPSILON) * 100) /
      100
    : 0;
  function next() {
    setError("");
    if (!name.trim()) {
      setError("Give this record a name.");
      return;
    }
    if (financial && !clientId) {
      setError("Choose a client first.");
      return;
    }
    if (resource === "arInvoices" && (!projectId || !validDate(due))) {
      setError("Choose a job and enter a valid due date (YYYY-MM-DD).");
      return;
    }
    if (step === 1 && !pricing) {
      setError(
        "Add a description, positive quantity and valid price for each item.",
      );
      return;
    }
    setStep((s) => s + 1);
  }
  async function save() {
    if (inFlight.current) return;
    setError("");
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      let payload: any = {
        name: name.trim(),
        status:
          resource === "clients"
            ? "ACTIVE"
            : resource === "projects"
              ? "PLANNING"
              : "DRAFT",
      };
      if (resource === "clients") payload = { ...payload, phone, email };
      if (resource === "projects")
        payload = { ...payload, clientId, location, scope };
      if (financial) {
        if (!pricing || !clientId)
          throw new Error("Complete the client and pricing details.");
        payload = {
          ...payload,
          clientId,
          currency,
          items: pricing.items,
          total,
          scope,
        };
        if (resource === "estimates")
          payload = { ...payload, markup: pricing.markup };
        else {
          if (!projectId || !validDate(due))
            throw new Error("Choose a job and a valid due date.");
          payload = {
            ...payload,
            projectId,
            invoiceDate: localDate(),
            dueDate: due,
            amount: pricing.subtotal,
            vatPct: taxRate,
            vatAmount: Math.round(pricing.subtotal * taxRate) / 100,
          };
        }
      }
      const result = await api(
        orgPath(org, `records/${resource}`),
        "POST",
        payload,
      );
      saved.current = true;
      navigation.replace("Detail", { resource, id: result.row.id });
    } catch (e) {
      setError(describe(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (
    !canCreate(meta, resource) ||
    !["clients", "projects", "estimates", "arInvoices"].includes(resource)
  )
    return (
      <Screen>
        <ErrorBox message="You cannot create this record." />
      </Screen>
    );
  const editLine = (i: number, key: keyof Line, value: string) => {
    setDirty(true);
    setLines((l) => l.map((x, j) => (j === i ? { ...x, [key]: value } : x)));
  };
  return (
    <Screen>
      <Heading
        title={section?.action || "Create record"}
        sub={
          financial
            ? `${step + 1} of 3 · ${["Client & details", "Work & price", "Review & save"][step]}`
            : "Start with the basics. Add more later."
        }
      />
      {!!error && <ErrorBox message={error} />}
      <View pointerEvents={busy ? "none" : "auto"}>
        {(!financial || step === 0) && (
          <>
            <Input
              label={
                resource === "clients" ? "Client name" : "Name / description"
              }
              value={name}
              onChangeText={change(setName)}
            />
            {resource === "clients" ? (
              <>
                <Input
                  label="Phone (optional)"
                  value={phone}
                  onChangeText={change(setPhone)}
                  keyboardType="phone-pad"
                />
                <Input
                  label="Email (optional)"
                  value={email}
                  onChangeText={change(setEmail)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            ) : (
              <ReferencePicker
                label={financial ? "Client" : "Client (optional)"}
                resource="clients"
                value={clientId}
                onChange={change(setClient)}
              />
            )}{" "}
            {resource === "projects" && (
              <>
                <Input
                  label="Site location (optional)"
                  value={location}
                  onChangeText={change(setLocation)}
                />
                <Input
                  label="Work details (optional)"
                  multiline
                  value={scope}
                  onChangeText={change(setScope)}
                />
              </>
            )}
            {resource === "arInvoices" && (
              <>
                <ReferencePicker
                  label="Job"
                  resource="projects"
                  value={projectId}
                  onChange={change(setProject)}
                />
                <Input
                  label="Due date (YYYY-MM-DD)"
                  value={due}
                  onChangeText={change(setDue)}
                />
              </>
            )}
            {financial && (
              <Choice
                label="Currency"
                value={currency}
                onChange={change(setCurrency)}
                options={[
                  ...new Set([
                    meta.org.baseCurrency,
                    ...(meta.config.currency?.enabled || ["USD", "ZWG", "ZAR"]),
                  ]),
                ]
                  .filter(Boolean)
                  .map((c) => ({ value: c, label: c }))}
              />
            )}
          </>
        )}
        {financial && step === 1 && (
          <>
            {lines.map((l, i) => (
              <Card key={i}>
                <Text style={styles.label}>Item {i + 1}</Text>
                <Input
                  label="Work or material"
                  value={l.description}
                  onChangeText={(v) => editLine(i, "description", v)}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Quantity"
                      value={l.qty}
                      onChangeText={(v) => editLine(i, "qty", v)}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Unit (optional)"
                      value={l.unit}
                      onChangeText={(v) => editLine(i, "unit", v)}
                      placeholder="m², bags, hours"
                    />
                  </View>
                </View>
                <Input
                  label={`Price per unit (${currency})`}
                  value={l.rate}
                  onChangeText={(v) => editLine(i, "rate", v)}
                  keyboardType="decimal-pad"
                />
                {lines.length > 1 && (
                  <Button
                    title="Remove item"
                    secondary
                    onPress={() => {
                      setDirty(true);
                      setLines((ls) => ls.filter((_, j) => i !== j));
                    }}
                  />
                )}
              </Card>
            ))}
            <Button
              title="Add another item"
              secondary
              disabled={lines.length >= 80}
              onPress={() => {
                setDirty(true);
                setLines((l) => [
                  ...l,
                  { description: "", qty: "1", unit: "", rate: "" },
                ]);
              }}
            />
            {resource === "estimates" && (
              <>
                <Input
                  label="Markup — added to cost (%)"
                  value={markup}
                  onChangeText={change(setMarkup)}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.small}>
                  The percentage added to your costs. This is not the same as
                  profit margin.
                </Text>
              </>
            )}
            <Input
              label="Work details & terms (optional)"
              multiline
              value={scope}
              onChangeText={change(setScope)}
            />
          </>
        )}
        {financial && step === 2 && (
          <>
            <Card>
              <Text style={styles.title}>{name}</Text>
              <Reference resource="clients" id={clientId} label="Client" />
              {resource === "arInvoices" && (
                <Reference resource="projects" id={projectId} label="Job" />
              )}
              {pricing?.items.map((l, i) => (
                <View key={i} style={{ marginVertical: 9 }}>
                  <Text style={styles.title}>{l.description}</Text>
                  <Text style={styles.subtitle}>
                    {l.qty} {l.unit} × {money(l.unitPrice, currency)}
                  </Text>
                </View>
              ))}
              {resource === "estimates" && (
                <Text style={styles.subtitle}>Markup: {markup}%</Text>
              )}
              {taxRate > 0 && (
                <Text style={styles.subtitle}>VAT: {taxRate}%</Text>
              )}
              <View style={styles.divider} />
              <Text style={styles.amount}>{money(total, currency)}</Text>
              <Text style={styles.small}>
                Saved as a draft. Review and issue it using MYLA’s existing
                workflow before sending it as a final document.
              </Text>
            </Card>
            {!!scope && <Text style={styles.subtitle}>{scope}</Text>}
          </>
        )}
      </View>
      {financial && step < 2 ? (
        <Button title="Continue" onPress={next} />
      ) : (
        <Button
          title={financial ? "Save draft" : "Save"}
          onPress={save}
          busy={busy}
        />
      )}{" "}
      {financial && step > 0 && (
        <Button
          title="Back"
          secondary
          disabled={busy}
          onPress={() => setStep((s) => s - 1)}
        />
      )}
      <Text style={[styles.small, { marginTop: 12 }]}>
        Online only. If saving is not confirmed, check your records before
        creating another copy.
      </Text>
    </Screen>
  );
}
function Progress({ route, navigation }: any) {
  const { org, meta } = useWorkspace();
  const { resource, row } = route.params;
  const [value, setValue] = useState(String(row.progress || 0)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function save() {
    const progress = Number(value);
    if (
      !value.trim() ||
      !Number.isFinite(progress) ||
      progress < 0 ||
      progress > 100
    ) {
      setError("Enter a percentage from 0 to 100.");
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await api(orgPath(org, `records/${resource}/${row.id}`), "PATCH", {
        progress,
      });
      navigation.goBack();
    } catch (e) {
      setError(describe(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!canUpdate(meta, resource))
    return (
      <Screen>
        <ErrorBox message="Your role cannot update this record." />
      </Screen>
    );
  return (
    <Screen>
      <Heading title={row.title || row.name} />
      {!!error && <ErrorBox message={error} />}
      <Input
        label="Work completed (%)"
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
      />
      <Button title="Save progress" busy={busy} onPress={save} />
      <Text style={styles.small}>
        This updates the progress figure only. It does not close the job or mark
        a task complete.
      </Text>
    </Screen>
  );
}
function Payment({ route, navigation }: any) {
  const { org, meta, userId } = useWorkspace();
  const invoice = route.params.invoice;
  const [amount, setAmount] = useState(
      Math.max(
        0,
        Number(invoice.total || 0) - Number(invoice.amountPaid || 0),
      ).toFixed(2),
    ),
    [method, setMethod] = useState("Bank transfer"),
    [date, setDate] = useState(localDate()),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    setError("");
    try {
      const minor = minorUnits(amount);
      if (
        minor >
        Math.round(
          (Number(invoice.total || 0) - Number(invoice.amountPaid || 0)) * 100,
        )
      )
        throw new Error("This is more than the outstanding invoice amount.");
      if (!validDate(date)) throw new Error("Enter a valid date (YYYY-MM-DD).");
      if (!invoice.clientId || !invoice.currency)
        throw new Error(
          "The invoice needs a client and currency before recording a payment.",
        );
      lock.current = true;
      setBusy(true);
      const payload = {
        receipt: {
          name: `Receipt for ${invoice.number}`,
          clientId: invoice.clientId,
          projectId: invoice.projectId || "",
          currency: invoice.currency,
          amount: (minor / 100).toFixed(2),
          method,
          paymentDate: date,
          reference: reference.trim(),
        },
        allocations: [
          { invoiceId: invoice.id, amount: (minor / 100).toFixed(2) },
        ],
      };
      const requestId = await receiptKey(userId, org, payload);
      await api(orgPath(org, "receipts"), "POST", { requestId, ...payload });
      Alert.alert(
        "Payment recorded",
        "The payment has been matched to this invoice.",
      );
      navigation.goBack();
    } catch (e) {
      setError(describe(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!canReceive(meta))
    return (
      <Screen>
        <ErrorBox message="Your role cannot record payments." />
      </Screen>
    );
  return (
    <Screen>
      <Heading
        title="Record payment"
        sub={`For ${invoice.number}. Record money already received; this does not move money.`}
      />
      {!!error && <ErrorBox message={error} />}
      <Input
        label={`Amount received (${invoice.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      <Input
        label="Payment date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        editable={!busy}
      />
      <Choice
        label="Payment method"
        value={method}
        onChange={(v) => {
          if (!busy) setMethod(v);
        }}
        options={[
          "Bank transfer",
          "RTGS",
          "Mobile money",
          "Cash",
          "Cheque",
          "Card",
          "Offset",
        ].map((x) => ({ value: x, label: x }))}
      />
      <Input
        label="Reference (optional)"
        value={reference}
        onChangeText={setReference}
        editable={!busy}
      />
      <Button title="Record payment" busy={busy} onPress={save} />
      <Text style={styles.small}>
        If confirmation is interrupted, retry the same details. The saved
        request key prevents an identical retry from creating another payment.
      </Text>
    </Screen>
  );
}
