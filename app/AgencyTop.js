import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "./firebaseConfig";
import { callApi } from "../utils/api";

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

// PERF FIX: renderAvatar / renderPodiumCard / renderRow pehle component
// ke andar plain functions the -> har render par naye ban rahe the, aur
// FlatList ko diya gaya renderItem bhi har render par naya reference leta
// tha, jisse list scroll ke waqt extra re-renders hote the. Ab ye bahar
// standalone memo() components hain, sirf props badalne par re-render
// honge -> scrolling aur re-renders dono zyada smooth.
const AgencyAvatar = memo(function AgencyAvatar({ agency, size = 76 }) {
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
});

const PodiumCard = memo(function PodiumCard({ agency, rank, onPress }) {
  const theme = rankTheme[rank];
  if (!agency || !theme) return null;

  const isFirst = rank === 1;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onPress(agency)}
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
        <AgencyAvatar agency={agency} size={isFirst ? 102 : 80} />
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
});

const AgencyRow = memo(function AgencyRow({ item, index, onPress }) {
  const rank = index + 1;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => onPress(item)}
      style={styles.row}
    >
      <View style={styles.rankCircle}>
        <Text style={styles.rankCircleText}>{rank}</Text>
      </View>

      <View style={styles.rowAvatarWrap}>
        <AgencyAvatar agency={item} size={58} />
      </View>

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
});

export default function AgencyTop({ navigation, router }) {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // JOIN REQUEST POPUP
  const [selectedAgency, setSelectedAgency] = useState(null);
  // loading | none | pending | member | owner | in_other_agency | blocked
  const [joinStatus, setJoinStatus] = useState("loading");
  const [sending, setSending] = useState(false);

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

  // BUG FIX: topThree agencies podium me alag se dikhti hain, lekin list
  // (FlatList) pehle "agencies"/"visibleAgencies" (index 0 se) use kar rahi
  // thi -> top 3 agencies list me DUPLICATE ho rahi thi aur galat rank
  // number dikha rahi thi (offset +3 lagne ke bawajood data start index 0
  // se tha). Ab list sirf "rest" (index 3 se aage) dikhayegi.
  const topThree = useMemo(() => agencies.slice(0, 3), [agencies]);
  const rest = useMemo(() => agencies.slice(3), [agencies]);

  const visibleAgencies = useMemo(
    () => (showAll ? rest : rest.slice(0, PAGE_SIZE)),
    [rest, showAll]
  );

  const goBack = useCallback(() => {
    if (router?.back) router.back();
    else if (navigation?.goBack) navigation.goBack();
  }, [router, navigation]);

  // Agency par tap -> popup khulta hai (request bhejo ya cancel karo)
  const openAgency = useCallback(async (agency) => {
    setSelectedAgency(agency);
    setJoinStatus("loading");
    try {
      const res = await callApi("/agency/join-status", { agencyId: agency.id });
      if (res && res.success === false) throw new Error(res.error);
      setJoinStatus(res?.blocked ? "blocked" : res?.status || "none");
    } catch (e) {
      console.log("JOIN STATUS ERROR:", e);
      setJoinStatus("none");
    }
  }, []);

  const closePopup = useCallback(() => {
    if (sending) return;
    setSelectedAgency(null);
  }, [sending]);

  const sendJoinRequest = useCallback(async () => {
    if (!selectedAgency || sending) return;
    try {
      setSending(true);
      const res = await callApi("/agency/request-join", {
        agencyId: selectedAgency.id,
      });
      if (res && res.success === false) throw new Error(res.error);
      setJoinStatus("pending");
      Alert.alert("Request Sent", "Agency owner accept karega to aap join ho jaoge.");
    } catch (e) {
      Alert.alert("Error", e?.message || "Request nahi bheji ja saki");
    } finally {
      setSending(false);
    }
  }, [selectedAgency, sending]);

  const cancelJoinRequest = useCallback(async () => {
    if (!selectedAgency || sending) return;
    try {
      setSending(true);
      const res = await callApi("/agency/cancel-join-request", {
        agencyId: selectedAgency.id,
      });
      if (res && res.success === false) throw new Error(res.error);
      setJoinStatus("none");
    } catch (e) {
      Alert.alert("Error", e?.message || "Request cancel nahi ho saki");
    } finally {
      setSending(false);
    }
  }, [selectedAgency, sending]);

  // Stable renderItem reference for FlatList -> kam re-renders, smooth scroll.
  // "rest" list ka pehla item asal me overall #4 rank hai (top 3 podium me
  // hain), isliye index me +3 offset diya jaata hai.
  const renderRow = useCallback(
    ({ item, index }) => (
      <AgencyRow item={item} index={index + 3} onPress={openAgency} />
    ),
    [openAgency]
  );
  const keyExtractor = useCallback((item) => item.id, []);

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
            data={visibleAgencies}
            keyExtractor={keyExtractor}
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            // PERF: smoother scroll, kam initial render
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={false}
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
                    {topThree[1] && (
                      <PodiumCard agency={topThree[1]} rank={2} onPress={openAgency} />
                    )}
                    {topThree[0] && (
                      <PodiumCard agency={topThree[0]} rank={1} onPress={openAgency} />
                    )}
                    {topThree[2] && (
                      <PodiumCard agency={topThree[2]} rank={3} onPress={openAgency} />
                    )}
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

      {/* Agency join request popup */}
      <Modal
        visible={!!selectedAgency}
        transparent
        animationType="fade"
        onRequestClose={closePopup}
      >
        <View style={styles.modalBg}>
          <View style={styles.popup}>
            {selectedAgency && (
              <>
                <AgencyAvatar agency={selectedAgency} size={84} />
                <Text numberOfLines={1} style={styles.popupName}>
                  {selectedAgency.agencyName || "Unnamed Agency"}
                </Text>
                <Text style={styles.popupOwner}>
                  {selectedAgency.ownerName
                    ? `Owner • ${selectedAgency.ownerName}`
                    : "Official Agency"}
                </Text>

                <View style={styles.popupStats}>
                  <Ionicons name="star" size={13} color="#FFD34E" />
                  <Text style={styles.popupStatText}>
                    {formatNumber(selectedAgency.totalStars)} stars
                  </Text>
                  <View style={styles.dot} />
                  <Ionicons name="people" size={12} color="#AEB9D8" />
                  <Text style={styles.popupStatText}>
                    {formatNumber(selectedAgency.totalMembers)} members
                  </Text>
                </View>

                {joinStatus === "loading" ? (
                  <ActivityIndicator
                    color="#FFD34E"
                    style={{ marginVertical: 22 }}
                  />
                ) : joinStatus === "none" ? (
                  <>
                    <Text style={styles.popupQuestion}>
                      Is agency ko join request bhejni hai?
                    </Text>
                    <View style={styles.popupBtnRow}>
                      <TouchableOpacity
                        style={[styles.popupBtn, styles.rejectPopupBtn]}
                        onPress={closePopup}
                        disabled={sending}
                      >
                        <Text style={styles.rejectPopupText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.popupBtn, styles.sendPopupBtn]}
                        onPress={sendJoinRequest}
                        disabled={sending}
                      >
                        {sending ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <Text style={styles.sendPopupText}>Send Request</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : joinStatus === "pending" ? (
                  <>
                    <Text style={styles.popupQuestion}>
                      Request bhej di gayi hai. Agency owner ke accept karne ka
                      intezaar hai.
                    </Text>
                    <View style={styles.popupBtnRow}>
                      <TouchableOpacity
                        style={[styles.popupBtn, styles.rejectPopupBtn]}
                        onPress={cancelJoinRequest}
                        disabled={sending}
                      >
                        {sending ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.rejectPopupText}>
                            Cancel Request
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.popupBtn, styles.sendPopupBtn]}
                        onPress={closePopup}
                      >
                        <Text style={styles.sendPopupText}>OK</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.popupQuestion}>
                      {joinStatus === "member"
                        ? "Aap is agency ke member ho."
                        : joinStatus === "owner"
                        ? "Ye aapki apni agency hai."
                        : joinStatus === "blocked"
                        ? "Ye agency abhi available nahi hai."
                        : "Aap pehle se kisi agency me ho."}
                    </Text>
                    <TouchableOpacity
                      style={[styles.popupBtn, styles.sendPopupBtn, { alignSelf: "stretch" }]}
                      onPress={closePopup}
                    >
                      <Text style={styles.sendPopupText}>OK</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
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

  /* JOIN REQUEST POPUP */
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  popup: {
    width: "86%",
    alignItems: "center",
    backgroundColor: "#0D1330",
    borderWidth: 1,
    borderColor: "#28335F",
    borderRadius: 20,
    padding: 22,
  },
  popupName: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 12,
    maxWidth: "95%",
  },
  popupOwner: { color: "#8C98B8", fontSize: 12, marginTop: 3 },
  popupStats: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  popupStatText: {
    color: "#AEB7D2",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 3,
  },
  popupQuestion: {
    color: "#D9DEFF",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 18,
    marginBottom: 16,
  },
  popupBtnRow: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  popupBtn: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectPopupBtn: {
    backgroundColor: "#2A1620",
    borderWidth: 1,
    borderColor: "#7A2A3E",
  },
  rejectPopupText: { color: "#FF6B85", fontWeight: "900", fontSize: 14 },
  sendPopupBtn: { backgroundColor: "#FFD34E" },
  sendPopupText: { color: "#000", fontWeight: "900", fontSize: 14 },

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

