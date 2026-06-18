import React from 'react';
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

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const getIconColor = (path) => {
    return pathname === path ? '#3498db' : '#ffffff';
  };

  return (
    <View style={styles.bottomSection}>
      <View style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>

          {/* HOME */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => router.replace('/')}
          >
            <Ionicons
              name="home-outline"
              size={26}
              color={getIconColor('/')}
            />
          </TouchableOpacity>

          {/* SEARCH */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => router.replace('/explore')}
          >
            <Ionicons
              name="search"
              size={26}
              color={getIconColor('/explore')}
            />
          </TouchableOpacity>

          {/* PLUS BUTTON */}
          <View style={styles.navItem}>
            <TouchableOpacity
              style={styles.plusBtn}
              onPress={() => router.push('/camera')}
            >
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* MESSAGES */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => router.replace('/messages')}
          >
            <Ionicons
              name="chatbubble-ellipses"
              size={26}
              color={getIconColor('/messages')}
            />
          </TouchableOpacity>

          {/* PROFILE */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              const user = auth.currentUser;

              if (!user) {
                router.push('/login');
                return;
              }

              router.replace('/profile');
            }}
          >
            <Ionicons
              name="person-outline"
              size={26}
              color={getIconColor('/profile')}
            />
          </TouchableOpacity>

        </View>
      </View>

      <View style={styles.bottomFill} />
    </View>
  );
}

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