// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // custom menu (BottomNav) use ho raha hai
        lazy: true, // tab pehli baar kholne par hi mount hoga (app start halka)
      }}
    >
      {/* For You feed: freeze NAHI.
          Video pause logic isFocused state par chalta hai; freeze kiya to
          Discover/Follow par jaate hi video ki awaaz chalti rahegi. */}
      <Tabs.Screen name="index" />

      {/* Follow / Discover: tabs ki tarah mount rehte hain -> dobara kholne par
          turant dikhte hain (reload nahi). Dikhte nahi to React render band (freeze)
          -> JS thread free, For You feed smooth rehta hai. */}
      <Tabs.Screen name="follow" options={{ freezeOnBlur: true }} />
      <Tabs.Screen name="discover" options={{ freezeOnBlur: true }} />

      {/* Baaki tabs: jab dikh nahi rahe to freeze */}
      <Tabs.Screen name="explore" options={{ freezeOnBlur: true }} />
      <Tabs.Screen name="messages" options={{ freezeOnBlur: true }} />
      <Tabs.Screen name="profile" options={{ freezeOnBlur: true }} />
      <Tabs.Screen name="allvideo" options={{ freezeOnBlur: true }} />
    </Tabs>
  );
}
