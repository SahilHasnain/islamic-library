import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../../hooks/useAppTheme";

const IS_WEB = Platform.OS === "web";

const TAB_NAV_LAYOUT = {
  sidebarMinViewportWidth: 900,
  sidebarWidth: 248,
  bottomBarHeight: 56,
} as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const useSidebar = IS_WEB && windowWidth >= TAB_NAV_LAYOUT.sidebarMinViewportWidth;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: useSidebar ? "left" : "bottom",
        tabBarActiveTintColor: colors.tabBarActiveTint,
        tabBarInactiveTintColor: colors.tabBarInactiveTint,
        tabBarStyle: useSidebar
          ? {
              width: TAB_NAV_LAYOUT.sidebarWidth,
              minWidth: 0,
              backgroundColor: colors.tabBar,
              borderTopWidth: 0,
              borderRightColor: colors.tabBarBorder,
              borderRightWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 16,
            }
          : {
              backgroundColor: colors.tabBar,
              borderTopColor: colors.tabBarBorder,
              height: TAB_NAV_LAYOUT.bottomBarHeight + insets.bottom,
              paddingTop: 0,
              paddingBottom: 0,
            },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
        tabBarItemStyle: useSidebar
          ? {
              paddingVertical: 4,
            }
          : undefined,
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.navigate({ pathname: "/library", params: { search: "1" } });
          },
        }}
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
