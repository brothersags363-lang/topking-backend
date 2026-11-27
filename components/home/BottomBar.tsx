import { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from '../../utils/safeRouter';
import { requireLogin } from '../../utils/requireLogin';
import { auth } from './feedShared';
import { VideoSeekBar } from './VideoSeekBar';
import { styles } from './feedStyles';

// ======================================================
// BottomBar — nav bar alag memo component
// Sirf pathname / onLayout badalne par re-render; swipe, like, comment par nahi.
// ======================================================
export const BottomBar = memo(function BottomBar({ pathname, onLayout }) {
  const router = useRouter();
  const color = (p) => (pathname === p ? '#3498db' : '#ffffff');

  return (
    <View style={styles.bottomSection} onLayout={onLayout}>
      <VideoSeekBar />
      <View style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>

          {/* HOME */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name="home-outline" size={26} color="#fff" />
          </TouchableOpacity>

          {/* SEARCH */}
          <TouchableOpacity style={styles.navItem} onPress={() => { if (requireLogin(router)) router.replace('/explore'); }}>
            <Ionicons name="search" size={28} color="#fff" />
          </TouchableOpacity>

          {/* CENTER PLUS BUTTON */}
          <View style={styles.navItem}>
            <TouchableOpacity style={styles.plusBtn} onPress={() => { if (requireLogin(router)) router.push('/camera'); }}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* MESSAGES */}
          <TouchableOpacity style={styles.navItem} onPress={() => { if (requireLogin(router)) router.replace('/messages'); }}>
            <Ionicons name="mail-outline" size={26} color="#fff" />
          </TouchableOpacity>

          {/* PROFILE */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              if (!auth.currentUser) {
                router.push('/login');
                return;
              }
              router.replace('/profile');
            }}
          >
            <Ionicons name="person-outline" size={26} color="#fff" />
          </TouchableOpacity>

        </View>
      </View>
      <View style={styles.bottomFill} />
    </View>
  );
});

