import { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './feedStyles';

// ==========================================================
// FeedTopBar — Live icon + Discover / Follow / For You
// memo: sirf activeTab badalne par re-render, scroll/like par nahi
// ==========================================================
export const FeedTopBar = memo(function FeedTopBar({
  activeTab,
  onLive,
  onDiscover,
  onFollow,
  onForYou,
}) {
  return (
    <View style={styles.topBar} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.topLiveBtn}
        onPress={onLive}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Ionicons name="radio-outline" size={26} color="#ffffff" style={styles.iconShadow} />
      </TouchableOpacity>

      <View style={styles.topTabsRow}>
        <TouchableOpacity
          style={styles.topTabBtn}
          onPress={onDiscover}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.topTabText, activeTab === 'discover' && styles.topTabTextActive]}>Discover</Text>
          {activeTab === 'discover' && <View style={styles.topTabUnderline} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.topTabBtn}
          onPress={onFollow}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.topTabText, activeTab === 'follow' && styles.topTabTextActive]}>Follow</Text>
          {activeTab === 'follow' && <View style={styles.topTabUnderline} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.topTabBtn}
          onPress={onForYou}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.topTabText, activeTab === 'foryou' && styles.topTabTextActive]}>For You</Text>
          {activeTab === 'foryou' && <View style={styles.topTabUnderline} />}
        </TouchableOpacity>
      </View>
    </View>
  );
});

