import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

/**
 * Agency Top / Leaderboard
 *
 * Expected Firestore collection:
 *   agencies/{agencyId}
 *
 * Fields used:
 *   agencyName: string
 *   logo: string (Firebase Storage download URL recommended)
 *   ownerName: string
 *   ownerUserId: string
 *   totalMembers: number
 *   totalStars: number
 *   status: "active" | "blocked" | ...
 *
 * Ranking:
 *   totalStars first. totalMembers is shown as a secondary stat.
 *
 * If your firebaseConfig is in another location, change the import above.
 */

const PAGE_SIZE = 20;

const formatNumber = (value = 0) => {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}K`;
  return `${Math.round(n)}`;
};

const rankTheme = {
  1: {
    accent: "#FFD34E",
    dark: "#4A2B00",
    glow: "rgba(255, 205, 63, 0.24)",
    medal: "👑",
  },
  2: {
    accent: "#C9D8F7",
    dark: "#263653",
    glow: "rgba(180, 205, 255, 0.18)",
    medal: "🥈",
  },
  3: {
    accent: "#FF9A62",
    dark: "#4A2414",
    glow: "rgba(255, 130, 78, 0.20)",
    medal: "🥉",
  },
};

export default function AgencyTop({ navigation, router }) {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "agencies"),
      orderBy("totalStars", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.status !== "blocked");

        setAgencies(rows);
        setLoading(false);
      },
      (error) => {
        console.log("Agency leaderboard error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const visibleAgencies = useMemo(
    () => (showAll ? agencies : agencies.slice(0, PAGE_SIZE)),
    [agencies, showAll]
  );

  const topThree = agencies.slice(0, 3);
  const rest = agencies.slice(3);

  const goBack = () => {
    if (router?.back) router.back();
    else if (navigation?.goBack) navigation.goBack();
  };

  const openAgency = (agency) => {
    // Optional: replace with your own agency profile route.
    if (router?.push) {
      router.push({
        pathname: "/AgencyProfile",
        params: { agencyId: agency.id },
      });
    }
  };

  const renderAvatar = (agency, size = 76) => {
    if (agency.logo) {
      return (
        <Image
          source={{ uri: agency.logo }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      );
    }

    return (
      <View
        style={[
          styles.defaultAvatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Ionicons name="business" size={size * 0.42} color="#BFC8E8" />
      </View>
    );
  };

  const renderPodiumCard = (agency, rank) => {
    const theme = rankTheme[rank];
    if (!agency || !theme) return null;

    const isFirst = rank === 1;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openAgency(agency)}
        style={[
          styles.podiumCard,
          isFirst ? styles.firstPodium : styles.sidePodium,
          {
            borderColor: theme.accent + "55",
            shadowColor: theme.accent,
          },
        ]}
      >
        <View
          style={[
            styles.podiumGlow,
            {
              backgroundColor: theme.glow,
            },
          ]}
        />

        <View style={[styles.rankMedal, { backgroundColor: theme.dark }]}>
          <Text style={styles.medalEmoji}>{theme.medal}</Text>
          <Text style={[styles.rankNumber, { color: theme.accent }]}>
            {rank}
          </Text>
        </View>

        <View
          style={[
            styles.avatarRing,
            {
              borderColor: theme.accent,
              width: isFirst ? 116 : 92,
              height: isFirst ? 116 : 92,
              borderRadius: isFirst ? 58 : 46,
            },
          ]}
        >
          {renderAvatar(agency, isFirst ? 102 : 80)}
        </View>

        <Text numberOfLines={1} style={styles.podiumName}>
          {agency.agencyName || "Unnamed Agency"}
        </Text>

        <Text numberOfLines={1} style={styles.ownerName}>
          {agency.ownerName ? `Owner • ${agency.ownerName}` : "Official Agency"}
        </Text>

        <View style={styles.starPill}>
          <Ionicons name="star" size={11} color={theme.accent} />
          <Text style={styles.starPillText}>
            {formatNumber(agency.totalStars)} Stars
          </Text>
        </View>

        <Text style={styles.memberText}>
          {formatNumber(agency.totalMembers)} members
        </Text>
      </TouchableOpacity>
    );
  };

  const renderRow = ({ item, index }) => {
    const rank = index + 1;

    return (
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => openAgency(item)}
        style={styles.row}
      >
        <View style={styles.rankCircle}>
          <Text style={styles.rankCircleText}>{rank}</Text>
        </View>

        <View style={styles.rowAvatarWrap}>{renderAvatar(item, 58)}</View>

        <View style={styles.rowInfo}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.rowName}>
              {item.agencyName || "Unnamed Agency"}
            </Text>
            {item.status === "active" && (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color="#6D7CFF"
                style={{ marginLeft: 5 }}
              />
            )}
          </View>

          <Text numberOfLines={1} style={styles.rowOwner}>
            {item.ownerName ? `Owner: ${item.ownerName}` : "Official Agency"}
          </Text>

          <View style={styles.statsLine}>
            <Ionicons name="star" size={13} color="#FFD34E" />
            <Text style={styles.statsText}>
              {formatNumber(item.totalStars)} stars
            </Text>
            <View style={styles.dot} />
            <Ionicons name="people" size={11} color="#AEB9D8" />
            <Text style={styles.statsText}>
              {formatNumber(item.totalMembers)} members
            </Text>
          </View>
        </View>

        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>TOP</Text>
          <Text style={styles.scoreRank}>{rank}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#070B22" />

      <View style={styles.background}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.titleIcon}>
              <Ionicons name="business" size={15} color="#FFD34E" />
            </View>
            <View>
              <Text style={styles.title}>
                Top <Text style={styles.titleAccent}>Agencies</Text>
              </Text>
              <Text style={styles.subtitle}>Leading agencies this month</Text>
            </View>
          </View>

          <View style={styles.headerTrophy}>
            <Ionicons name="trophy" size={19} color="#FFD34E" />
          </View>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <View style={styles.diamond} />
          <View style={styles.line} />
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#FFD34E" />
            <Text style={styles.loadingText}>Loading agencies...</Text>
          </View>
        ) : agencies.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={42} color="#8290B8" />
            </View>
            <Text style={styles.emptyTitle}>No agencies yet</Text>
            <Text style={styles.emptyText}>
              Once agencies start earning stars, they will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={showAll ? agencies : visibleAgencies}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => renderRow({ item, index: index + 3 })}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              <>
                <View style={styles.hero}>
                  <View style={styles.heroLeft}>
                    <Text style={styles.heroCaption}>TOP AGENCIES</Text>
                    <Text style={styles.heroTitle}>
                      Star <Text style={styles.heroAccent}>Leaderboard</Text>
                    </Text>
                  </View>
                  <Ionicons name="trophy" size={22} color="#FFD34E" />
                </View>

                {topThree.length > 0 && (
                  <View style={styles.podium}>
                    {topThree[1] && renderPodiumCard(topThree[1], 2)}
                    {topThree[0] && renderPodiumCard(topThree[0], 1)}
                    {topThree[2] && renderPodiumCard(topThree[2], 3)}
                  </View>
                )}

                <View style={styles.listHeader}>
                  <View>
                    <Text style={styles.listTitle}>All Agencies</Text>
                    <Text style={styles.listSubtitle}>
                      Ranked by total stars
                    </Text>
                  </View>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                </View>
              </>
            }
            ListFooterComponent={
              rest.length > PAGE_SIZE && !showAll ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.viewMore}
                  onPress={() => setShowAll(true)}
                >
                  <Text style={styles.viewMoreText}>View More Agencies</Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              ) : showAll && agencies.length > PAGE_SIZE ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.viewMore}
                  onPress={() => setShowAll(false)}
                >
                  <Text style={styles.viewMoreText}>Show Top 20</Text>
                  <Ionicons name="chevron-up" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#070B22",
  },
  background: {
    flex: 1,
    backgroundColor: "#070B22",
  },

  /* SMALL HEADER */
  header: {
    height: 110,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101735",
    borderWidth: 1,
    borderColor: "#28335D",
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  titleIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#201A30",
    borderWidth: 1,
    borderColor: "#554A70",
    marginRight: 7,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  titleAccent: {
    color: "#D957FF",
  },
  subtitle: {
    color: "#7F8BAB",
    fontSize: 8.5,
    marginTop: 1,
    fontWeight: "600",
  },
  headerTrophy: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16192F",
    borderWidth: 1,
    borderColor: "#343A67",
  },

  divider: {
    height: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  line: {
    height: 1,
    flex: 1,
    backgroundColor: "#2A3260",
  },
  diamond: {
    width: 5,
    height: 5,
    marginHorizontal: 8,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "#FFD34E",
  },

  content: {
    paddingHorizontal: 8,
    paddingBottom: 18,
  },

  /* COMPACT HERO */
  hero: {
    minHeight: 50,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D1330",
    borderWidth: 1,
    borderColor: "#28335F",
  },
  heroLeft: {
    flex: 1,
  },
  heroCaption: {
    color: "#7886AC",
    fontSize: 7.5,
    letterSpacing: 1.3,
    fontWeight: "900",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  heroAccent: {
    color: "#FFD34E",
  },
  heroText: {
    color: "#8C98B8",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
  },

  /* TOP 3 - SMALL AND CLEAN */
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    marginBottom: 8,
  },
  podiumCard: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    borderRadius: 13,
    backgroundColor: "#0D1330",
    borderWidth: 1,
    paddingTop: 5,
    paddingHorizontal: 3,
    shadowOpacity: 0.13,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  firstPodium: {
    minHeight: 196,
    paddingTop: 1,
  },
  sidePodium: {
    minHeight: 172,
  },
  podiumGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 58,
    top: 30,
    opacity: 0.55,
  },
  rankMedal: {
    minWidth: 43,
    height: 24,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginBottom: 5,
  },
  medalEmoji: {
    fontSize: 12,
    marginRight: 2,
  },
  rankNumber: {
    fontSize: 12,
    fontWeight: "900",
  },
  avatarRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "#151B39",
    padding: 3,
  },
  defaultAvatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B2345",
  },
  podiumName: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
    marginTop: 6,
    maxWidth: "95%",
  },
  ownerName: {
    color: "#737F9F",
    fontSize: 7.5,
    marginTop: 1,
    maxWidth: "95%",
  },
  starPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181C39",
    borderWidth: 1,
    borderColor: "#30375E",
    borderRadius: 11,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 5,
  },
  starPillText: {
    color: "#F4F6FF",
    fontSize: 8,
    fontWeight: "800",
    marginLeft: 2,
  },
  memberText: {
    color: "#707D9F",
    fontSize: 7.5,
    marginTop: 3,
    marginBottom: 7,
  },

  /* LIST HEADER */
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  listTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  listSubtitle: {
    color: "#737F9F",
    fontSize: 8.5,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 11,
    backgroundColor: "#161A37",
    borderWidth: 1,
    borderColor: "#2D3563",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FF5470",
    marginRight: 4,
  },
  liveText: {
    color: "#AAB4D4",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  /* SMALL ROWS */
  row: {
    minHeight: 62,
    borderRadius: 13,
    backgroundColor: "#0D1330",
    borderWidth: 1,
    borderColor: "#202A51",
    marginBottom: 5,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#131A3A",
    borderWidth: 1,
    borderColor: "#4950A8",
    marginRight: 6,
  },
  rankCircleText: {
    color: "#D9DEFF",
    fontSize: 10,
    fontWeight: "900",
  },
  rowAvatarWrap: {
    marginRight: 7,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowName: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "900",
    maxWidth: "88%",
  },
  rowOwner: {
    color: "#727F9E",
    fontSize: 8.5,
    marginTop: 1,
  },
  statsLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  statsText: {
    color: "#AEB7D2",
    fontSize: 8.5,
    fontWeight: "700",
    marginLeft: 2,
  },
  dot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#596684",
    marginHorizontal: 5,
  },
  scoreBox: {
    width: 31,
    height: 39,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111838",
    borderWidth: 1,
    borderColor: "#28335E",
    marginLeft: 4,
  },
  scoreLabel: {
    color: "#69779E",
    fontSize: 5.5,
    letterSpacing: 0.7,
    fontWeight: "900",
  },
  scoreRank: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 0,
  },

  viewMore: {
    height: 40,
    borderRadius: 20,
    marginTop: 3,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#151B3D",
    borderWidth: 1,
    borderColor: "#354071",
  },
  viewMoreText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
    marginRight: 5,
  },

  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#7E8CB1",
    fontSize: 10,
    marginTop: 8,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111735",
    borderWidth: 1,
    borderColor: "#303B68",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 11,
  },
  emptyText: {
    color: "#7F8BAF",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 5,
  },
});

