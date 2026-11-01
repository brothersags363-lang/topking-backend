import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { auth } from "../app/firebaseConfig";

const ACTIVE = '#3498db';
const IDLE = '#ffffff';
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  // Follow / Discover bhi Home ka hissa hain -> Home icon highlight rahe
  const onHome = pathname === '/' || pathname === '/follow' || pathname === '/discover';

  const goHome = useCallback(() => { if (pathname !== '/') router.replace('/'); }, [router, pathname]);
  const goSearch = useCallback(() => router.replace('/explore'), [router]);
  const goCamera = useCallback(() => router.push('/camera'), [router]);
  const goMessages = useCallback(() => router.replace('/messages'), [router]);
  const goProfile = useCallback(() => {
    if (!auth.currentUser) {
      router.push('/login');
      return;
    }
    router.replace('/profile');
  }, [router]);

  return (
    <View style={styles.bottomSection}>
      <View style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>

          {/* HOME */}
          <TouchableOpacity style={styles.navItem} onPress={goHome} hitSlop={HIT} activeOpacity={0.7}>
            <Ionicons name="home-outline" size={26} color={onHome ? ACTIVE : IDLE} />
          </TouchableOpacity>

          {/* SEARCH */}
          <TouchableOpacity style={styles.navItem} onPress={goSearch} hitSlop={HIT} activeOpacity={0.7}>
            <Ionicons name="search" size={26} color={pathname === '/explore' ? ACTIVE : IDLE} />
          </TouchableOpacity>

          {/* PLUS BUTTON */}
          <View style={styles.navItem}>
            <TouchableOpacity style={styles.plusBtn} onPress={goCamera} activeOpacity={0.8}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* MESSAGES */}
          <TouchableOpacity style={styles.navItem} onPress={goMessages} hitSlop={HIT} activeOpacity={0.7}>
            <Ionicons name="chatbubble-ellipses" size={26} color={pathname === '/messages' ? ACTIVE : IDLE} />
          </TouchableOpacity>

          {/* PROFILE */}
          <TouchableOpacity style={styles.navItem} onPress={goProfile} hitSlop={HIT} activeOpacity={0.7}>
            <Ionicons name="person-outline" size={26} color={pathname === '/profile' ? ACTIVE : IDLE} />
          </TouchableOpacity>

        </View>
      </View>

      <View style={styles.bottomFill} />
    </View>
  );
}

export default memo(BottomNav);

const styles = StyleSheet.create({
  bottomSection: {
    position: 'absolute',
    bottom: 0, // aur niche chahiye to -15 ya -20 kar do
    width: '100%',
    backgroundColor: '#000',
    borderTopWidth: 0.5,
    borderTopColor: '#222',
  },

  bottomNavContainer: {
    width: '100%',
    height: 70,
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 10 : 10,
  },

  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  plusBtn: {
    backgroundColor: '#f1c40f',
    width: 48,
    height: 35,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  plusText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginTop: -4,
  },

  bottomFill: {
    backgroundColor: '#000',
    width: '100%',
    height: Platform.OS === 'ios' ? 35 : 20,
  },
});
