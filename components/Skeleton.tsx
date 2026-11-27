// =====================================================================
// Skeleton.tsx — spinner ki jagah page ka dhancha (grey boxes), Instagram jaisa
//
//   <SkeletonRows count={8} />          // list (photo + naam) jaise followers, chats
//   <SkeletonGrid count={9} />          // 3-column video grid
//   <SkeletonBox style={{...}} />       // koi bhi ek box
//
// Halka "saans lene" wala animation native driver par chalta hai (JS thread free).
// Ek hi shared Animated value -> 50 box ho tab bhi ek hi animation.
// =====================================================================
import React, { memo, useEffect } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View, ViewStyle } from 'react-native';

const pulse = new Animated.Value(0.45);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function usePulse() {
  useEffect(() => {
    users += 1;
    if (!loop) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
    }
    return () => {
      users -= 1;
      if (users <= 0 && loop) {
        loop.stop();
        loop = null;
        users = 0;
      }
    };
  }, []);
}

export const SkeletonBox = memo(function SkeletonBox({ style }: { style?: ViewStyle | ViewStyle[] }) {
  usePulse();
  return <Animated.View style={[styles.box, style as any, { opacity: pulse }]} />;
});

export const SkeletonRows = memo(function SkeletonRows({
  count = 8,
  avatar = 48,
}: {
  count?: number;
  avatar?: number;
}) {
  usePulse();
  return (
    <View style={styles.rows} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Animated.View
            style={[styles.box, { width: avatar, height: avatar, borderRadius: avatar / 2, opacity: pulse }]}
          />
          <View style={styles.lines}>
            <Animated.View style={[styles.box, styles.line1, { opacity: pulse }]} />
            <Animated.View style={[styles.box, styles.line2, { opacity: pulse }]} />
          </View>
        </View>
      ))}
    </View>
  );
});

const W = Dimensions.get('window').width;

export const SkeletonGrid = memo(function SkeletonGrid({
  count = 9,
  columns = 3,
  gap = 2,
  ratio = 1.33,
}: {
  count?: number;
  columns?: number;
  gap?: number;
  ratio?: number;
}) {
  usePulse();
  const size = (W - gap * (columns - 1)) / columns;
  return (
    <View style={[styles.grid, { gap }]} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.box, { width: size, height: size * ratio, borderRadius: 2, opacity: pulse }]}
        />
      ))}
    </View>
  );
});

// Profile page ka dhancha: photo, naam, stats, buttons, video grid
export const ProfileSkeleton = memo(function ProfileSkeleton() {
  usePulse();
  const A = (st: any) => <Animated.View style={[styles.box, st, { opacity: pulse }]} />;
  return (
    <View style={styles.profile} pointerEvents="none">
      <View style={styles.profileTop}>
        {A({ width: 96, height: 96, borderRadius: 48 })}
        {A({ width: 140, height: 16, marginTop: 14 })}
        {A({ width: 90, height: 12, marginTop: 8 })}
        <View style={styles.stats}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.stat}>
              {A({ width: 40, height: 16 })}
              {A({ width: 56, height: 10, marginTop: 6 })}
            </View>
          ))}
        </View>
        <View style={styles.btns}>
          {A({ flex: 1, height: 38, marginRight: 8 })}
          {A({ flex: 1, height: 38 })}
        </View>
      </View>
      <SkeletonGrid count={9} />
    </View>
  );
});

// Video feed ka dhancha: kaala screen + right side buttons + neeche naam / caption
export const FeedSkeleton = memo(function FeedSkeleton() {
  usePulse();
  const A = (st: any) => <Animated.View style={[styles.box, st, { opacity: pulse }]} />;
  return (
    <View style={styles.feed} pointerEvents="none">
      <View style={styles.feedRight}>
        {A({ width: 48, height: 48, borderRadius: 24, marginBottom: 22 })}
        {[0, 1, 2, 3].map((i) => (
          <View key={i}>{A({ width: 36, height: 36, borderRadius: 18, marginBottom: 20 })}</View>
        ))}
      </View>
      <View style={styles.feedBottom}>
        {A({ width: 130, height: 14, marginBottom: 10 })}
        {A({ width: '70%', height: 12, marginBottom: 8 })}
        {A({ width: '45%', height: 12 })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  profile: { flex: 1, backgroundColor: '#000' },
  profileTop: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginTop: 20 },
  stat: { alignItems: 'center' },
  btns: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 18 },
  feed: { flex: 1, backgroundColor: '#000' },
  feedRight: { position: 'absolute', right: 12, bottom: 140, alignItems: 'center' },
  feedBottom: { position: 'absolute', left: 14, right: 90, bottom: 110 },
  box: { backgroundColor: '#2a2a2a', borderRadius: 6 },
  rows: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  lines: { flex: 1, marginLeft: 12 },
  line1: { height: 12, width: '55%', marginBottom: 8 },
  line2: { height: 10, width: '35%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default SkeletonBox;
