import { memo, useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { auth } from './feedShared';
import { styles } from './feedStyles';

// ======================================================
// FollowPill — username ke aage PEELA "Follow" button (Insta style)
// ======================================================
// followState: undefined = abhi check ho raha hai (button NAHI dikhega -> flash nahi)
//              true      = pehle se follow kiya hai (button NAHI dikhega)
//              false     = follow nahi kiya (button dikhega)
// Follow dabate hi button chhota hoke halke se gayab ho jata hai.
export const FollowPill = memo(function FollowPill({ userId, followState, onFollow }) {
  const show = followState === false && !!userId && auth.currentUser?.uid !== userId;
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [show, anim]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={show ? 'auto' : 'none'}
      style={{
        opacity: anim,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }}
    >
      <TouchableOpacity
        style={styles.followPill}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        onPress={() => onFollow(userId)}
      >
        <Text style={styles.followPillText}>Follow</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ======================================================
// ProfilePlus — profile photo ke neeche chhota PEELA "+" (follow ke liye)
// ======================================================
// FollowPill wali hi logic: followState === false hone par hi dikhta hai.
// Dabate hi onFollow chalta hai (optimistic, instant) aur "+" chhota hoke
// gayab ho jata hai. Native driver -> scroll / like par koi lag nahi.
export const ProfilePlus = memo(function ProfilePlus({ userId, followState, onFollow }) {
  const show = followState === false && !!userId && auth.currentUser?.uid !== userId;
  const anim = useRef(new Animated.Value(show ? 1 : 0)).current;
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [show, anim]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={show ? 'auto' : 'none'}
      style={[
        styles.profilePlus,
        {
          opacity: anim,
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        style={styles.profilePlusBtn}
        onPress={() => onFollow(userId)}
      >
        <View style={styles.profilePlusH} />
        <View style={styles.profilePlusV} />
      </TouchableOpacity>
    </Animated.View>
  );
});

