import React, { useState, useEffect } from 'react';
import {
  View,
 Text,
  StyleSheet,
 Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import {
  useLocalSearchParams,
  useRouter,
  usePathname,
} from 'expo-router';

// FIREBASE
import { db } from '../firebaseConfig';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

const { width } = Dimensions.get('window');
const ITEM_SIZE = width / 3 - 2;

export default function UserPage() {
  const { id } = useLocalSearchParams();

  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [userVideos, setUserVideos] = useState([]);

  useEffect(() => {
    if (id) {
      fetchPublicUser();
    }
  }, [id]);

  const fetchPublicUser = async () => {
    try {
      const userSnap = await getDoc(doc(db, 'users', id));

      if (userSnap.exists()) {
        setUserData(userSnap.data());

        // Fetch Videos
        const vQuery = query(
          collection(db, 'all_videos'),
          where('userId', '==', id)
        );

        const vSnap = await getDocs(vQuery);

        setUserVideos(
          vSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      } else {
        Alert.alert('Error', 'User nahi mila!');
      }
    } catch (e) {
      console.log('Firestore Error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getIconColor = (path) => {
    return pathname === path ? '#f1c40f' : '#fff';
  };

  // LOADING
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#f1c40f" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>

          <Text style={styles.headerUsername}>
            @{userData?.username || 'user'}
          </Text>

          <TouchableOpacity
            onPress={() =>
              Alert.alert('Share', 'Profile link copy ho gaya!')
            }
          >
            <Ionicons
              name="share-social-outline"
              size={26}
              color="#000"
            />
          </TouchableOpacity>
        </View>

        <FlatList
          data={userVideos}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 15 }}>
              {/* PROFILE */}
              <View style={styles.mainInfo}>
                <View style={styles.avatarBorder}>
                  <Image
                    source={{
                      uri:
                        userData?.profileImg ||
                        'https://via.placeholder.com/150',
                    }}
                    style={styles.avatar}
                  />
                </View>

                <View style={styles.statsContainer}>
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNum}>122k</Text>
                      <Text style={styles.statLabel}>followers</Text>
                    </View>

                    <View style={styles.statBox}>
                      <Text style={styles.statNum}>350</Text>
                      <Text style={styles.statLabel}>following</Text>
                    </View>

                    <View style={styles.statBox}>
                      <Text style={styles.statNum}>2.1M</Text>
                      <Text style={styles.statLabel}>likes</Text>
                    </View>
                  </View>
                </View>
              </View>

              <Text style={styles.categoryText}>
                {userData?.category || 'Video Creator'}
              </Text>

              <Text style={styles.bioText}>
                {userData?.bioText || 'No bio available'}
              </Text>

              {/* BUTTONS */}
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.followBtn}>
                  <Text style={styles.btnText}>Follow</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.instaBtn}>
                  <Ionicons
                    name="logo-instagram"
                    size={22}
                    color="#000"
                  />
                </TouchableOpacity>
              </View>

              {/* RANK BOX */}
              <View style={styles.rankBox}>
                <View style={styles.rankLeft}>
                  <MaterialCommunityIcons
                    name="star-shooting"
                    size={28}
                    color="#f1c40f"
                  />

                  <Text style={styles.rankTitle}>No.1 {'>'}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.rankRight}>
                  <View style={styles.crownCircle}>
                    <MaterialCommunityIcons
                      name="crown"
                      size={16}
                      color="#FFD700"
                    />
                  </View>

                  <View style={styles.circle} />
                  <View style={styles.circle} />

                  <Text style={{ fontSize: 20 }}>⭐</Text>
                </View>
              </View>

              {/* TABS */}
              <View style={styles.tabRow}>
                <View style={styles.tabActive}>
                  <MaterialCommunityIcons
                    name="grid"
                    size={26}
                    color="#000"
                  />

                  <View style={styles.underline} />
                </View>

                <Ionicons
                  name="heart-outline"
                  size={26}
                  color="#888"
                />

                <Ionicons
                  name="bookmark-outline"
                  size={26}
                  color="#888"
                />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.videoGrid}
    onPress={() => router.push(`/user/${item.id}`)}
            >
              <Video
                source={{ uri: item.videoUrl }}
                style={{ flex: 1 }}
                resizeMode={ResizeMode.COVER}
                isMuted
                shouldPlay={false}
              />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>

      {/* BOTTOM NAV */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNavContainer}>
          <View style={styles.bottomNav}>
            
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
           
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => router.push('/explore')}
            >
              <Ionicons
                name="search"
                size={26}
                color={getIconColor('/explore')}
              />
            </TouchableOpacity>

            <View style={styles.navItem}>
              <TouchableOpacity
                style={styles.plusBtn}
                onPress={() => router.push('/camera')}
              >
                <Text style={styles.plusText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.navItem}
              onPress={() => router.push('/messages')}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={26}
                color={getIconColor('/messages')}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={() => router.push('/profile')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 25,
  },

  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },

  headerUsername: {
    fontSize: 17,
    fontWeight: 'bold',
  },

  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },

  avatarBorder: {
    borderWidth: 2,
    borderColor: '#f1c40f',
    borderRadius: 50,
    padding: 3,
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
  },

  statsContainer: {
    flex: 1,
    marginLeft: 20,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  statBox: {
    alignItems: 'center',
  },

  statNum: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  statLabel: {
    fontSize: 12,
    color: '#777',
  },

  categoryText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    color: '#333',
  },

  bioText: {
    fontSize: 14,
    marginTop: 4,
    color: '#444',
  },

  btnRow: {
    flexDirection: 'row',
    marginTop: 15,
    gap: 10,
  },

  followBtn: {
    backgroundColor: '#f1c40f',
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },

  btnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },

  instaBtn: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  rankBox: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  rankTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  divider: {
    width: 1,
    height: 25,
    backgroundColor: '#ddd',
    marginHorizontal: 10,
  },

  rankRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1.5,
    justifyContent: 'space-around',
  },

  crownCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },

  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eee',
  },

  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 25,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },

  tabActive: {
    alignItems: 'center',
    paddingBottom: 10,
  },

  underline: {
    width: 40,
    height: 3,
    backgroundColor: '#000',
    marginTop: 5,
  },

  videoGrid: {
    width: ITEM_SIZE,
    height: ITEM_SIZE * 1.4,
    backgroundColor: '#000',
    margin: 1,
  },

  bottomSection: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },

  bottomNavContainer: {
    width: '100%',
    backgroundColor: '#000',
    height: 60,
    justifyContent: 'center',
  },

  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  navItem: {
    alignItems: 'center',
  },

  plusBtn: {
    backgroundColor: '#f1c40f',
    width: 50,
    height: 35,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  plusText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },

  bottomFill: {
    backgroundColor: '#000',
    height: Platform.OS === 'ios' ? 30 : 10,
  },
});