// ======================================================================
// AppBottomNav - poori app ka ek hi niche wala (negative) nav bar
// Home / Explore / Profile / Messages sab isi ko use karte hain.
// Design badalna ho to sirf is file me badlo => sab page me badal jayega.
//
// Use:  <AppBottomNav />
// Home me seek bar upar chahiye:  <AppBottomNav onLayout={...}><VideoSeekBar /></AppBottomNav>
// ======================================================================
import React, { memo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { useRouter } from '../utils/safeRouter';

// Nav bar niche se kitna upar rahe (system bar ke upar).
// Bar system bar ke andar jaye to number BADHAO, zyada upar lage to KAM karo.
const BOTTOM_GAP = Platform.OS === 'ios' ? 40 : 37;

type Props = {
  onLayout?: (e: LayoutChangeEvent) => void;
  children?: React.ReactNode; // nav ke theek upar kuch dikhana ho (jaise seek bar)
};

const AppBottomNav = memo(function AppBottomNav({ onLayout, children }: Props) {
  const router = useRouter();

  const goProfile = () => {
    if (!getAuth().currentUser) {
      router.push('/login' as any);
      return;
    }
    router.replace('/profile' as any);
  };

  return (
    <View
      style={[styles.bottomSection, { paddingBottom: BOTTOM_GAP }]}
      onLayout={onLayout}
    >
      {children}

      <View style={styles.bottomNav}>
        {/* HOME */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/' as any)}>
          <Ionicons name="home-outline" size={26} color="#fff" />
        </TouchableOpacity>

        {/* SEARCH */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore' as any)}>
          <Ionicons name="search" size={28} color="#fff" />
        </TouchableOpacity>

        {/* PLUS */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/camera' as any)}>
          <View style={styles.plusBtn}>
            <Text style={styles.plusText}>+</Text>
          </View>
        </TouchableOpacity>

        {/* MESSAGES */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages' as any)}>
          <Ionicons name="mail-outline" size={26} color="#fff" />
        </TouchableOpacity>

        {/* PROFILE */}
        <TouchableOpacity style={styles.navItem} onPress={goProfile}>
          <Ionicons name="person-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default AppBottomNav;

const styles = StyleSheet.create({
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#000',
    zIndex: 99,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 56,
  },
  navItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  plusBtn: {
    width: 48,
    height: 34,
    borderRadius: 14,
    backgroundColor: '#FFD400',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },
});
