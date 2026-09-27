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
import { useCallback, useEffect, useState, memo } from "react";
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

// PERF FIX: TopCard aur LeaderRow pehle TopFollowersPage function ke ANDAR
// define the. Iska matlab har render (state change) par ye components
// naye sirre se ban rahe the, isliye React inhe purane se compare nahi kar
// paata tha aur FlatList/UI flicker + slow ho jaata tha. Ab ye bahar hain
// aur memo() se wrap hain, sirf apne props change hone par re-render honge.
// Rank-based color scheme: gold / silver / bronze
const RANK_THEME = {
  1: {
    ring: ["#FFE58A", "#FFB300", "#FF7A00"],
    badgeBg: "#F4A900",
    badgeBorder: "#FFE6A1",
    glow: "#F4A900",
  },
  2: {
    ring: ["#FFFFFF", "#C9D4ED", "#7787AD"],
    badgeBg: "#7184B5",
    badgeBorder: "#E5ECFF",
    glow: "#8FB4FF",
  },
  3: {
    ring: ["#FFD1A8", "#F18A4B", "#9B431C"],
    badgeBg: "#D96831",
    badgeBorder: "#FFD0A7",
    glow: "#FF8A3D",
  },
};

const TopCard = memo(function TopCard({ user, rank, onPress }) {
  if (!user) {
    return <View style={styles.emptyTopCard} />;
  }

  const isFirst = rank === 1;
  const isSecond = rank === 2;
  const theme = RANK_THEME[rank] || RANK_THEME[3];

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onPress(user)}
      style={[
        styles.topCard,
        isFirst && styles.firstCard,
        isSecond && styles.secondCard,
        !isFirst && !isSecond && styles.thirdCard,
      ]}
    >
      {/* Crown + rank number badge */}
      <View style={styles.crownPosition}>
        <Text style={[styles.crownText, isFirst && styles.crownTextBig]}>
          {isFirst ? "👑" : "♛"}
        </Text>
        <View
          style={[
            styles.crownNumberCircle,
            {
              backgroundColor: theme.badgeBg,
              borderColor: theme.badgeBorder,
            },
          ]}
        >
          <Text style={styles.crownNumberText}>{rank}</Text>
        </View>
      </View>

      {/* Laurel wreath, only around the #1 spot */}
      {isFirst && (
        <>
          <Text style={styles.laurelLeft}>🌿</Text>
          <Text style={styles.laurelRight}>🌿</Text>
        </>
      )}

      <View
        style={[
          styles.avatarGlowWrap,
          { shadowColor: theme.glow },
        ]}
      >
        <LinearGradient
          colors={theme.ring}
          style={[styles.avatarOuter, isFirst && styles.avatarOuterBig]}
        >
          <Image
            source={{ uri: getPhoto(user) }}
            style={[styles.topAvatar, isFirst && styles.topAvatarBig]}
          />
        </LinearGradient>
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

      {/* Glowing podium base strip */}
      <View
        style={[
          styles.pedestal,
          isFirst && styles.pedestalFirst,
          {
            backgroundColor: theme.badgeBg,
            shadowColor: theme.glow,
          },
        ]}
      />
    </TouchableOpacity>
  );
});

// PERF FIX: LeaderRow bhi bahar aur memo() ke saath, taaki list scroll
// karte waqt off-screen/unchanged rows dobara render na hon.
const LeaderRow = memo(function LeaderRow({ item, index, onPress }) {
  const rank = index + 4;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.row}
      onPress={() => onPress(item)}
    >
      <View style={styles.rankRing}>
        <LinearGradient
          colors={["#20154B", "#0F1733"]}
          style={styles.rankCircle}
        >
          <Text style={styles.rankText}>
            {rank}
          </Text>
        </LinearGradient>
      </View>

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
});

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

  const openProfile = useCallback((user) => {
    if (!user?.id) return;

    router.push({
      pathname: "/userProfile",
      params: {
        userId: user.id,
      },
    });
  }, [router]);

  // FlatList ko stable renderItem chahiye, warna items unnecessarily
  // re-render/re-mount hote hain scroll ke waqt.
  const renderLeaderRow = useCallback(
    ({ item, index }) => (
      <LeaderRow item={item} index={index} onPress={openProfile} />
    ),
    [openProfile]
  );
  const keyExtractor = useCallback((item) => item.id, []);

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
            keyExtractor={keyExtractor}
            renderItem={renderLeaderRow}
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
                        onPress={openProfile}
                      />
                    </View>

                    <View style={styles.centerPodium}>
                      <TopCard
                        user={first}
                        rank={1}
                        onPress={openProfile}
                      />
                    </View>

                    <View style={styles.sidePodium}>
                      <TopCard
                        user={third}
                        rank={3}
                        onPress={openProfile}
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
                            onPress={openProfile}
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
    shadowColor: "#F4A900",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  secondCard: {
    borderColor: "#7183AE",
    shadowColor: "#8FB4FF",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  thirdCard: {
    borderColor: "#A85329",
    shadowColor: "#FF8A3D",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  emptyTopCard: { flex: 1 },

  crownPosition: {
    position: "absolute",
    top: -32,
    alignItems: "center",
    zIndex: 10,
  },
  crownText: { fontSize: 24, textAlign: "center" },
  crownTextBig: { fontSize: 32 },
  crownNumberCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginTop: -8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  crownNumberText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },

  laurelLeft: {
    position: "absolute",
    left: 0,
    top: 30,
    fontSize: 20,
    zIndex: 5,
    transform: [{ rotate: "-20deg" }, { scaleX: -1 }],
  },
  laurelRight: {
    position: "absolute",
    right: 0,
    top: 30,
    fontSize: 20,
    zIndex: 5,
    transform: [{ rotate: "20deg" }],
  },

  avatarGlowWrap: {
    borderRadius: 36,
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  avatarOuter: {
    width: 60,
    height: 60,
    borderRadius: 31,
    padding: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOuterBig: {
    width: 70,
    height: 70,
    borderRadius: 36,
  },
  topAvatar: {
    width: 55,
    height: 55,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "#0A1027",
    backgroundColor: "#1B2240",
  },
  topAvatarBig: {
    width: 64,
    height: 64,
    borderRadius: 33,
  },

  pedestal: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 5,
    borderRadius: 3,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  pedestalFirst: { height: 7 },

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
  rankRing: {
    width: 33,
    height: 33,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#F4A900",
    justifyContent: "center",
    alignItems: "center",
  },
  rankCircle: {
    width: 27,
    height: 27,
    borderRadius: 14,
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
    backgroundColor: "#151022",
    borderWidth: 1.3,
    borderColor: "#F4A900",
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

