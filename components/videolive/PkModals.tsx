// @ts-nocheck
import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { gifts } from '../../assets/giftsData';
import { Image as ExpoImage } from 'expo-image';
import { STABLE_AVATAR, PK_DURATION_SEC, PK_FRIEND_MODE, PK_DURATIONS } from './constants';
import { MatchTimer } from './LiveWidgets';
import { styles } from './styles';
import { timer } from './tickScheduler';

export function PkSheetModal({ friendsList, pkCandidates, pkDuration, pkFriendRows, pkFriendsLive, pkListVisible, pkLoading, pkRecommended, pkSettingsOpen, renderPkRow, setPkDuration, setPkListVisible, setPkSettingsOpen, startRandomMatch }: any) {
  return (
    <>
      {/* ================= PK: SHEET (host) ================= */}
      <Modal transparent visible={pkListVisible} animationType="slide" onRequestClose={() => setPkListVisible(false)}>
        <TouchableOpacity style={styles.pkSheetOverlay} activeOpacity={1} onPress={() => setPkListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.pkSheet}>
            <View style={styles.pkSheetHead}>
              <TouchableOpacity style={styles.pkHeadIcon} onPress={() => Alert.alert("PK history", "No PK battles yet.")}>
                <Ionicons name="time-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.pkLogo}>
                <Text style={{ color: "#29D3F5" }}>P</Text>
                <Text style={{ color: "#FF3FA4" }}>K</Text>
              </Text>
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  style={styles.pkHeadIcon}
                  onPress={() =>
                    Alert.alert(
                      "PK Battle",
                      "Challenge another live host. The host who receives the most gifts when the timer ends wins. Random Match finds an online host for you automatically."
                    )
                  }
                >
                  <Ionicons name="help-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.pkHeadIcon} onPress={() => setPkSettingsOpen((v) => !v)}>
                  <Ionicons name="settings-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {pkSettingsOpen && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <Text style={styles.qtyLbl}>Battle length</Text>
                {PK_DURATIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setPkDuration(d)}
                    style={[styles.qtyChip, pkDuration === d && styles.qtyChipOn]}
                  >
                    <Text style={[styles.qtyChipTxt, pkDuration === d && { color: "#fff" }]}>{d / 60} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              <View style={styles.pkCardsRow}>
                <TouchableOpacity
                  style={[styles.pkCard, { backgroundColor: "#8E44FF", marginRight: 10 }]}
                  activeOpacity={0.85}
                  onPress={startRandomMatch}
                >
                  <View style={styles.pkCardIcon}>
                    <Ionicons name="shuffle" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pkCardTitle}>Random Match</Text>
                    <Text style={styles.pkCardSub} numberOfLines={2}>
                      PK with other hosts online
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pkCard, { backgroundColor: "#FF8A4C" }]}
                  activeOpacity={0.85}
                  onPress={() => Alert.alert("Family PK", "Family PK is coming soon.")}
                >
                  <View style={styles.pkCardIcon}>
                    <Ionicons name="trophy" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pkCardTitle}>Family PK</Text>
                    <Text style={styles.pkCardSub} numberOfLines={2}>
                      Start a PK against other families
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {pkLoading && pkCandidates.length === 0 && friendsList.length === 0 ? (
                <ActivityIndicator color="#F71084" style={{ marginTop: 40 }} />
              ) : (
                <>
                  <Text style={styles.pkSectionTitle}>
                    Friends{pkFriendsLive > 0 ? `  ·  ${pkFriendsLive} live` : ""}
                  </Text>
                  {pkFriendRows.length === 0 ? (
                    <Text style={styles.pkEmptySmall}>
                      {PK_FRIEND_MODE === "mutual"
                        ? "No friends yet. Follow each other to see them here."
                        : "No friends yet. Follow someone to see them here."}
                    </Text>
                  ) : (
                    pkFriendRows.map((r: any) => renderPkRow(r))
                  )}
                  {pkRecommended.length > 0 && (
                    <>
                      <Text style={styles.pkSectionTitle}>Hosts Recommended</Text>
                      {pkRecommended.map((r: any) => renderPkRow(r))}
                    </>
                  )}
                  {pkRecommended.length === 0 && pkFriendsLive === 0 && !pkLoading && (
                    <Text style={styles.emptyTxt}>No other host is live right now.</Text>
                  )}
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function PkMatchingModal({ cancelMatching, hostImg, isHost, matchMini, matchStartRef, matching, setMatchMini }: any) {
  return (
    <>
      {/* ================= PK: MATCHING (Random Match) ================= */}
      <Modal
        transparent
        visible={isHost && matching && !matchMini}
        animationType="slide"
        onRequestClose={() => setMatchMini(true)}
      >
        <View style={styles.matchOverlay} pointerEvents="box-none">
          <View style={styles.matchSheet}>
            <TouchableOpacity style={styles.matchChevron} onPress={() => setMatchMini(true)}>
              <Ionicons name="chevron-down" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.matchRow}>
              <View style={[styles.matchAvaRing, { borderColor: "#1E90FF" }]}>
                <ExpoImage source={{ uri: hostImg }} style={styles.matchAva} cachePolicy="memory-disk" transition={0} />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.matchTitle}>Matching...</Text>
                <MatchTimer startAt={matchStartRef.current} style={styles.matchTime} />
              </View>
              <View style={[styles.matchAvaRing, { borderColor: "#FF3FA4" }]}>
                <View style={[styles.matchAva, styles.matchUnknown]}>
                  <Ionicons name="person" size={34} color="#3a2030" />
                  <Text style={styles.matchQ}>?</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.matchCancel} onPress={cancelMatching}>
              <Text style={styles.matchCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function PkInviteModal({ acceptPkInvite, declinePkInvite, pkBusy, pkInvite, showInvite }: any) {
  return (
    <>
      {/* ================= PK: INCOMING INVITE (host) ================= */}
      <Modal transparent visible={!!showInvite} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.exitBox}>
            <ExpoImage source={{ uri: pkInvite?.fromImg || STABLE_AVATAR }} style={styles.inviteAva} cachePolicy="memory-disk" transition={0} />
            <Text style={styles.exitTitle}>PK Invite</Text>
            <Text style={styles.exitSub}>{pkInvite?.fromName || "A host"} wants a {Math.round((Number(pkInvite?.duration) || PK_DURATION_SEC) / 60)} min PK battle with you.</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.noBtn} onPress={declinePkInvite}>
                <Text style={styles.btnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.acceptBtn, pkBusy && { opacity: 0.5 }]} disabled={pkBusy} onPress={acceptPkInvite}>
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
