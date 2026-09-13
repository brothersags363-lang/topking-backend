import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { db } from "./firebaseConfig";

const { width } = Dimensions.get("window");

const DEFAULT_AVATAR =
  "https://avatar.iran.liara.run/public/65";

let topFollowersCache = null;
let topFollowersCacheTime = 0;
const TOP_FOLLOWERS_CACHE_MS = 30000;
const TOP_FOLLOWERS_STORAGE_KEY = "@top_followers_cache_v2";
const MAX_PROFILE_READS = 50;

/*
  FIRESTORE STRUCTURE FROM YOUR DATABASE:

  follows
    └── followDocument
        ├── followerId: "USER_A"
        ├── followingId: "USER_B"
        └── createdAt: ...

  IMPORTANT:
  Kisi user ke FOLLOWERS count ke liye:
  followingId === us user ka uid

  Example:
  A -> B follow karta hai
  followerId  = A
  followingId = B

  Isliye B ke followers = jitne documents me followingId == B hai.
*/

const getName = (user) =>
  user?.username ||
  user?.userName ||
  user?.name ||
  user?.displayName ||
  "User";

const getPhoto = (user) =>
  user?.profileImg ||
  user?.profileImage ||
  user?.profileImageUrl ||
  user?.photoURL ||
  user?.avatar ||
  DEFAULT_AVATAR;

const formatFollowers = (number) => {
  const n = Number(number) || 0;

  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`;
  }

  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }

  return String(n);
};

export default function TopFollowersPage() {
  const router = useRouter();

  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTopFollowers = async () => {
    const now = Date.now();

    // 1) Show memory cache instantly.
    if (topFollowersCache) {
      setLeaders(topFollowersCache);
      setLoading(false);

      if (now - topFollowersCacheTime < TOP_FOLLOWERS_CACHE_MS) {
        return;
      }
    }

    // 2) If memory cache is empty, show persistent cache instantly.
    // Firebase refresh continues in the background.
    if (!topFollowersCache) {
      try {
        const stored = await AsyncStorage.getItem(TOP_FOLLOWERS_STORAGE_KEY);

        if (stored) {
          const parsed = JSON.parse(stored);

          if (Array.isArray(parsed) && parsed.length) {
            topFollowersCache = parsed;
            topFollowersCacheTime = now;
            setLeaders(parsed);
            setLoading(false);
          }
        }
      } catch (cacheError) {
        console.log("TOP FOLLOWERS CACHE READ ERROR:", cacheError);
      }
    }

    try {
      // Do NOT show the full-screen loader when cached data is already visible.
      if (!topFollowersCache) {
        setLoading(true);
      }

      const followsSnap = await getDocs(collection(db, "follows"));

      const followerCountByUser = {};

      followsSnap.docs.forEach((followDoc) => {
        const followingId = followDoc.data()?.followingId;
        if (!followingId) return;

        followerCountByUser[followingId] =
          (followerCountByUser[followingId] || 0) + 1;
      });

      const topUserIds = Object.entries(followerCountByUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_PROFILE_READS)
        .map(([userId]) => userId);

      const users = await Promise.all(
        topUserIds.map(async (userId) => {
          try {
            const userSnap = await getDoc(doc(db, "users", userId));

            if (!userSnap.exists()) return null;

            return {
              id: userId,
              ...userSnap.data(),
              followersCount: followerCountByUser[userId] || 0,
            };
          } catch (error) {
            console.log("User load error:", userId, error);
            return null;
          }
        })
      );

      const sorted = users
        .filter(Boolean)
        .sort(
          (a, b) =>
            (b.followersCount || 0) - (a.followersCount || 0)
        );

      topFollowersCache = sorted;
      topFollowersCacheTime = Date.now();

      setLeaders(sorted);

      // Save latest result so next opening can render immediately.
      try {
        await AsyncStorage.setItem(
          TOP_FOLLOWERS_STORAGE_KEY,
          JSON.stringify(sorted)
        );
      } catch (cacheError) {
        console.log("TOP FOLLOWERS CACHE WRITE ERROR:", cacheError);
      }
    } catch (error) {
      console.log("TOP FOLLOWERS ERROR:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopFollowers();
  }, []);

  // UI order:
  // LEFT = #2
  // CENTER = #1
  // RIGHT = #3
  const second = leaders[1];
  const first = leaders[0];
  const third = leaders[2];

  const openProfile = (user) => {
    if (!user?.id) return;

    router.push({
      pathname: "/userProfile",
      params: {
        userId: user.id,
      },
    });
  };

  const TopCard = ({ user, rank }) => {
    if (!user) {
      return <View style={styles.emptyTopCard} />;
    }

    const isFirst = rank === 1;
    const isSecond = rank === 2;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openProfile(user)}
        style={[
          styles.topCard,
          isFirst && styles.firstCard,
          isSecond && styles.secondCard,
          !isFirst && !isSecond && styles.thirdCard,
        ]}
      >
        <View style={styles.crownPosition}>
          <Text style={styles.crownText}>
            {isFirst ? "👑" : "♛"}
          </Text>
        </View>

        <LinearGradient
          colors={
            isFirst
              ? ["#FFE58A", "#FFB300", "#FF7A00"]
              : isSecond
              ? ["#FFFFFF", "#C9D4ED", "#7787AD"]
              : ["#FFD1A8", "#F18A4B", "#9B431C"]
          }
          style={styles.avatarOuter}
        >
          <Image
            source={{ uri: getPhoto(user) }}
            style={styles.topAvatar}
          />
        </LinearGradient>

        <View
          style={[
            styles.numberBadge,
            isFirst && styles.firstNumber,
            isSecond && styles.secondNumber,
            !isFirst && !isSecond && styles.thirdNumber,
          ]}
        >
          <Text style={styles.numberText}>{rank}</Text>
        </View>

        <Text
          numberOfLines={1}
          style={[
            styles.topUsername,
            isFirst && styles.firstUsername,
          ]}
        >
          @{getName(user)}
        </Text>

        <View style={styles.followersInfo}>
          <Ionicons
            name="people"
            size={15}
            color="#DCE4F7"
          />
          <Text style={styles.followersText}>
            {formatFollowers(user.followersCount)} Followers
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const LeaderRow = ({ item, index }) => {
    const rank = index + 4;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.row}
        onPress={() => openProfile(item)}
      >
        <LinearGradient
          colors={["#20154B", "#0F1733"]}
          style={styles.rankCircle}
        >
          <Text style={styles.rankText}>
            {rank}
          </Text>
        </LinearGradient>

        <Image
          source={{ uri: getPhoto(item) }}
          style={styles.rowAvatar}
        />

        <View style={styles.rowInfo}>
          <Text
            numberOfLines={1}
            style={styles.rowUsername}
          >
            @{getName(item)}
          </Text>

          <View style={styles.rowFollowerLine}>
            <Ionicons
              name="people"
              size={14}
              color="#9EABCC"
            />

            <Text style={styles.rowFollowers}>
              {formatFollowers(item.followersCount)} Followers
            </Text>
          </View>
        </View>

        <View style={styles.profileArrow}>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="#FFFFFF"
          />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#05091B"
        />

        <ActivityIndicator
          size="large"
          color="#C56BFF"
        />

        <Text style={styles.loadingText}>
          Top Followers loading...
        </Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[
        "#05091B",
        "#080D25",
        "#050817",
      ]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safe}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#05091B"
        />

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>
              <Text style={styles.whiteTitle}>
                👑 Top{" "}
              </Text>
              <Text style={styles.pinkTitle}>
                Followers
              </Text>
            </Text>

            <Text style={styles.subtitle}>
              Our top followers this month
            </Text>
          </View>

          <View style={styles.trophyButton}>
            <Text style={styles.trophyEmoji}>
              🏆
            </Text>
          </View>
        </View>

        {leaders.length === 0 ? (
          <View style={styles.emptyScreen}>
            <Text style={styles.emptyEmoji}>
              👥
            </Text>

            <Text style={styles.emptyTitle}>
              No followers yet
            </Text>

            <Text style={styles.emptySubtitle}>
              Follow hone ke baad Top Followers
              yahan automatically dikhenge.
            </Text>
          </View>
        ) : (
          <FlatList
            data={leaders.slice(3)}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            contentContainerStyle={
              styles.listContent
            }
            ListHeaderComponent={
              <>
                {/* TOP 3 */}
                {leaders.length >= 3 && (
                  <View style={styles.podium}>
                    <View style={styles.sidePodium}>
                      <TopCard
                        user={second}
                        rank={2}
                      />
                    </View>

                    <View style={styles.centerPodium}>
                      <TopCard
                        user={first}
                        rank={1}
                      />
                    </View>

                    <View style={styles.sidePodium}>
                      <TopCard
                        user={third}
                        rank={3}
                      />
                    </View>
                  </View>
                )}

                {/* If only 1-2 users */}
                {leaders.length < 3 && (
                  <View style={styles.lessThanThree}>
                    {leaders.map(
                      (user, index) => (
                        <View
                          key={user.id}
                          style={styles.singleTopWrap}
                        >
                          <TopCard
                            user={user}
                            rank={index + 1}
                          />
                        </View>
                      )
                    )}
                  </View>
                )}

                {/* LIST BOX TOP */}
                {leaders.length > 3 && (
                  <View style={styles.listTopBorder} />
                )}
              </>
            }
            renderItem={LeaderRow}
            ListFooterComponent={
              leaders.length > 3 ? (
                <View style={styles.footer}>
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color="#FFFFFF"
                  />

                  <Text style={styles.footerText}>
                    View More
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  loadingScreen: {
    flex: 1,
    backgroundColor: "#05091B",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#AAB6D4",
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
  },

  /* HEADER */
  header: {
    height: 110,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
  },
  whiteTitle: { color: "#FFFFFF" },
  pinkTitle: { color: "#D05BFF" },
  subtitle: {
    color: "#8794B6",
    fontSize: 9,
    marginTop: 1,
    fontWeight: "600",
  },
  trophyButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#29345E",
    backgroundColor: "#101735",
    alignItems: "center",
    justifyContent: "center",
  },
  trophyEmoji: { fontSize: 16 },

  /* TOP 3 */
  podium: {
    height: 179,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sidePodium: {
    flex: 1,
    maxWidth: (width - 18) / 3,
    height: 150,
    justifyContent: "flex-end",
  },
  centerPodium: {
    flex: 1.08,
    maxWidth: (width - 18) / 2.75,
    height: 170,
    justifyContent: "flex-end",
  },
  topCard: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#28345D",
    backgroundColor: "#0A122D",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 3,
    paddingBottom: 10,
    position: "relative",
  },
  firstCard: {
    borderColor: "#D99A28",
    backgroundColor: "#14152F",
    elevation: 5,
  },
  secondCard: { borderColor: "#7183AE" },
  thirdCard: { borderColor: "#A85329" },
  emptyTopCard: { flex: 1 },

  crownPosition: {
    position: "absolute",
    top: -17,
    zIndex: 10,
  },
  crownText: { fontSize: 22 },

  avatarOuter: {
    width: 60,
    height: 60,
    borderRadius: 31,
    padding: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  topAvatar: {
    width: 55,
    height: 55,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "#0A1027",
    backgroundColor: "#1B2240",
  },

  numberBadge: {
    width: 27,
    height: 27,
    borderRadius: 14,
    marginTop: -13,
    zIndex: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  firstNumber: {
    backgroundColor: "#F4A900",
    borderColor: "#FFE6A1",
  },
  secondNumber: {
    backgroundColor: "#7184B5",
    borderColor: "#E5ECFF",
  },
  thirdNumber: {
    backgroundColor: "#D96831",
    borderColor: "#FFD0A7",
  },
  numberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  topUsername: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
    maxWidth: "94%",
  },
  firstUsername: { fontSize: 12 },

  followersInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  followersText: {
    color: "#C6D0E7",
    fontSize: 7.5,
    fontWeight: "600",
    marginLeft: 2,
  },

  lessThanThree: {
    flexDirection: "row",
    paddingHorizontal: 5,
    height: 220,
    alignItems: "flex-end",
  },
  singleTopWrap: {
    flex: 1,
    height: 205,
  },

  /* LIST */
  listTopBorder: {
    marginHorizontal: 7,
    height: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#29365F",
    backgroundColor: "#070E27",
  },
  listContent: {
    paddingBottom: 18,
  },
  row: {
    minHeight: 58,
    marginHorizontal: 7,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#070E27",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#202C52",
  },
  rankCircle: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#5E35AC",
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  rowAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginLeft: 7,
    borderWidth: 1.2,
    borderColor: "#35426D",
    backgroundColor: "#111936",
  },
  rowInfo: {
    flex: 1,
    marginLeft: 8,
    minWidth: 0,
  },
  rowUsername: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  rowFollowerLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
  rowFollowers: {
    color: "#98A6C7",
    fontSize: 9.5,
    fontWeight: "600",
    marginLeft: 3,
  },
  profileArrow: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#101A39",
    borderWidth: 1,
    borderColor: "#35436F",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },

  emptyScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 25,
  },
  emptyEmoji: { fontSize: 38 },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 10,
  },
  emptySubtitle: {
    color: "#AAB6D4",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 6,
  },

  footer: {
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  footerText: {
    color: "#AAB6D4",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 4,
  },
});

