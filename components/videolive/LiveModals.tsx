// @ts-nocheck
import LevelBadge from '../../components/LevelBadge';
import { UserLabel } from '../../components/live/UserLabel';
import { fmtPoints } from '../../utils/familyUtils';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Modal, Platform, FlatList, KeyboardAvoidingView, Animated, Share, ScrollView, Switch } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { gifts } from '../../assets/giftsData';
import LevelFrame from '../../components/LevelFrame';
import LevelBar from '../../components/live/LevelBar';
import UserTick from '../../components/UserTick';
import { Image as ExpoImage } from 'expo-image';
import { STABLE_AVATAR, isVerified, MAX_GUESTS, WEEKLY_TARGET_MIN, FILTERS, GIFT_PAGE_W, GIFT_PAGES, width, height } from './constants';
import { GiftPage } from './GiftSheet';
import { REPORT_REASONS, getLevelTheme } from './helpers';
import { ProgressRing, giftPendingStore, GiftBalance } from './LiveWidgets';
import { styles } from './styles';

export function ExitModal({ confirmExit, exitModalVisible, isHost, setExitModalVisible }: any) {
  return (
    <>
      {/* ================= EXIT CONFIRM MODAL ================= */}
      <Modal transparent visible={exitModalVisible} animationType="fade" onRequestClose={() => setExitModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.exitBox}>
            <Text style={styles.exitTitle}>{isHost ? "End Live?" : "Leave Live?"}</Text>
            <Text style={styles.exitSub}>
              {isHost
                ? "Your live stream will end for everyone watching."
                : "You can rejoin anytime while the host is still live."}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.noBtn} onPress={() => setExitModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.yesBtn} onPress={confirmExit}>
                <Text style={styles.btnText}>{isHost ? "End Live" : "Leave"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function GiftModal({ closeGiftModal, giftModalAnim, giftModalVisible, giftPageIdx, giftQty, giftSelId, goRecharge, insets, myTotalSpent, myWalletLevel, sendSelectedGift, setGiftPageIdx, setGiftQty, stableSelectGift, stars }: any) {
  return (
    <>
      {/* ================= GIFT MODAL (compact, same as LiveRoom) ================= */}
      <Modal
        visible={giftModalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={closeGiftModal}
      >
        <View style={styles.giftOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeGiftModal} />

          <Animated.View
            style={[
              styles.giftSheet,
              {
                paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 28 : 14) + 10,
                transform: [{ translateY: giftModalAnim }],
              },
            ]}
          >
            {/* level bar: kitna star bheju to agla level mile */}
            <LevelBar
              style={{ marginHorizontal: 14 }}
              totalSpent={myTotalSpent}
              walletLevel={myWalletLevel}
              pendingStore={giftPendingStore}
              onUpgrade={goRecharge}
            />

            {/* gift pages: 4 columns x 2 rows, snap paging */}
            <FlatList
              data={GIFT_PAGES}
              keyExtractor={(p: any) => p.key}
              extraData={giftSelId}
              renderItem={({ item }: any) => <GiftPage page={item} selectedId={giftSelId} onSelect={stableSelectGift} />}
              horizontal
              snapToInterval={GIFT_PAGE_W}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_: any, index: number) => ({ length: GIFT_PAGE_W, offset: GIFT_PAGE_W * index, index })}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={5}
              removeClippedSubviews={false}
              bounces={Platform.OS === "ios"}
              overScrollMode="never"
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              onMomentumScrollEnd={(e: any) => {
                const idx = Math.max(
                  0,
                  Math.min(GIFT_PAGES.length - 1, Math.round(e.nativeEvent.contentOffset.x / GIFT_PAGE_W))
                );
                setGiftPageIdx((prev) => (prev === idx ? prev : idx));
              }}
            />

            {GIFT_PAGES.length > 1 && (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingTop: 4, paddingBottom: 8 }}>
                {GIFT_PAGES.map((p: any, i: number) => (
                  <View
                    key={p.key}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      marginHorizontal: 3,
                      backgroundColor: i === giftPageIdx ? "#FFFFFF" : "rgba(255,255,255,0.3)",
                    }}
                  />
                ))}
              </View>
            )}

            {/* bottom bar (Tiki): [star balance / Recharge >]   [1 9 99 199 999]  [Send] */}
            <View style={styles.giftBottomRow}>
              <View style={{ minWidth: 70 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="star" size={14} color="#FFC800" />
                  <GiftBalance stars={stars} style={styles.giftBalTxt} />
                </View>
                <TouchableOpacity onPress={goRecharge} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.giftRechargeTxt}>Recharge ›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.giftQtyPill}>
                {[1, 9, 99, 199, 999].map((q) => (
                  <TouchableOpacity
                    key={q}
                    activeOpacity={0.7}
                    delayPressIn={0}
                    onPress={() => setGiftQty(q)}
                    style={[styles.giftQtyChip, giftQty === q && styles.giftQtyChipSel]}
                  >
                    <Text style={[styles.giftQtyTxt, giftQty === q && styles.giftQtyTxtSel]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.giftSendBtn} activeOpacity={0.8} delayPressIn={0} onPress={sendSelectedGift}>
                <Text style={styles.giftSendTxt}>Send</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

export function ViewerListModal({ askKick, audienceArray, audienceSorted, canModerate, chatLocked, deleteAllChats, hostId, hostImg, hostName, isMod, mods, mutedUsers, openHostCard, setProfileCard, setViewerListVisible, toggleChatLock, viewerCount, viewerListVisible }: any) {
  return (
    <>
      {/* ================= VIEWER LIST ================= */}
      <Modal transparent visible={viewerListVisible} animationType="slide" onRequestClose={() => setViewerListVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setViewerListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.6 }]}>
            <Text style={styles.sheetTitle}>👥 Viewers ({viewerCount})</Text>
            <Text style={styles.sheetSub}>Tap a person to see their profile.</Text>
            {isMod && (
              <View style={styles.modBar}>
                <TouchableOpacity
                  style={[styles.modBarBtn, chatLocked && { backgroundColor: "#F71084" }]}
                  onPress={toggleChatLock}
                >
                  <Ionicons name={chatLocked ? "lock-closed" : "lock-open-outline"} size={15} color="#fff" />
                  <Text style={styles.modBarTxt}>{chatLocked ? "Chat locked" : "Lock chat"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modBarBtn, { backgroundColor: "#DC2626" }]} onPress={deleteAllChats}>
                  <Ionicons name="trash-outline" size={15} color="#fff" />
                  <Text style={styles.modBarTxt}>Delete all chats</Text>
                </TouchableOpacity>
              </View>
            )}
            {hostId ? (
              <TouchableOpacity
                style={styles.pkRow}
                onPress={() => {
                  setViewerListVisible(false);
                  openHostCard();
                }}
              >
                <ExpoImage source={{ uri: hostImg }} style={styles.pkRowAva} cachePolicy="memory-disk" transition={0} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pkRowName} numberOfLines={1}>
                    {hostName}
                  </Text>
                </View>
                <View style={[styles.roleTag, { backgroundColor: "#F71084" }]}>
                  <Text style={styles.roleTagTxt}>HOST</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {audienceArray.length === 0 ? (
              <Text style={styles.emptyTxt}>No viewers yet. Share the live to get people in!</Text>
            ) : (
              <FlatList
                data={audienceSorted}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews
                keyExtractor={(i: any) => i.uid}
                renderItem={({ item }: any) => {
                  const th = getLevelTheme(item.level || 1);
                  return (
                    <TouchableOpacity
                      style={styles.pkRow}
                      onPress={() => {
                        setViewerListVisible(false);
                        setProfileCard({
                          uid: item.uid,
                          name: item.name || item.username,
                          username: item.username,
                          img: item.img,
                          level: item.level,
                          verified: item.verified,
                          verifiedColor: item.verifiedColor,
                        });
                      }}
                    >
                      <ExpoImage source={{ uri: item.img || STABLE_AVATAR }} style={styles.pkRowAva} cachePolicy="memory-disk" transition={0} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <UserLabel level={item.level} name={item.name || item.username || "User"} uid={item.uid || item.userId || item.senderId || item.id} verified={item.verified} verifiedColor={item.verifiedColor} nameStyle={styles.pkRowName} tickSize={14} />
                        </View>
                        {(mods[item.uid] || mutedUsers[item.uid]) && (
                          <Text style={styles.pkRowSub}>
                            {mods[item.uid] ? "Moderator" : ""}
                            {mods[item.uid] && mutedUsers[item.uid] ? " · " : ""}
                            {mutedUsers[item.uid] ? "Muted" : ""}
                          </Text>
                        )}
                      </View>
                      {canModerate(item) ? (
                        <TouchableOpacity
                          style={styles.kickBtn}
                          onPress={() => askKick({ uid: item.uid, name: item.name || item.username, img: item.img, level: item.level, verified: item.verified, verifiedColor: item.verifiedColor })}
                        >
                          <Text style={styles.kickBtnTxt}>Kick</Text>
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function RankModal({ rankVisible, rankedGifters, setProfileCard, setRankVisible, stars }: any) {
  return (
    <>
      {/* ================= TOP GIFTERS RANKING ================= */}
      <Modal transparent visible={rankVisible} animationType="slide" onRequestClose={() => setRankVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setRankVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.55 }]}>
            <Text style={styles.sheetTitle}>🏆 Top Gifters</Text>
            <Text style={styles.sheetSub}>Ranked by stars sent in this live.</Text>
            {rankedGifters.length === 0 ? (
              <Text style={styles.emptyTxt}>No gifts yet. Be the first to send one! 🎁</Text>
            ) : (
              <FlatList
                data={rankedGifters}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews
                keyExtractor={(i: any) => i.uid}
                renderItem={({ item, index }: any) => (
                  <TouchableOpacity
                    style={styles.pkRow}
                    onPress={() => {
                      setRankVisible(false);
                      setProfileCard({
                        uid: item.uid,
                        name: item.name,
                        img: item.img,
                        level: item.level,
                        verified: item.verified,
                        verifiedColor: item.verifiedColor,
                      });
                    }}
                  >
                    <Text style={[styles.rankNum, index < 3 && { color: ["#FFD700", "#C0C0C0", "#CD7F32"][index] }]}>
                      {index + 1}
                    </Text>
                    <ExpoImage source={{ uri: item.img || STABLE_AVATAR }} style={styles.pkRowAva} cachePolicy="memory-disk" transition={0} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.pkRowName} numberOfLines={1}>
                          {item.name || "User"}
                        </Text>
                        <UserTick uid={item.uid} verified={!!item.verified} verifiedColor={item.verifiedColor} size={14} />
                      </View>
                      <Text style={styles.pkRowSub}>LV {item.level || 1}</Text>
                    </View>
                    <Text style={styles.rankStars}>⭐ {item.stars}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function ProfileCardModal({ canModerate, currentUid, goUserProfile, hostId, insets, isHost, kickBlock, kickDlg, kickUser, manageOpen, mods, muteGuest, muteUser, mutedUsers, openGiftModal, params, pcInfo, profileCard, profileFollowing, removeGuest, roomData, router, setKickBlock, setKickDlg, setManageOpen, setProfileCard, setReportTarget, toggleMod, toggleProfileFollow }: any) {
  return (
    <>
      {/* ================= USER PROFILE CARD (bottom sheet) ================= */}
      <Modal transparent visible={!!profileCard} animationType="slide" statusBarTranslucent onRequestClose={() => setProfileCard(null)}>
        <View style={styles.pcOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPressIn={() => setProfileCard(null)} />
          {profileCard && (
            <View style={[styles.pcSheet, { paddingBottom: 16 + insets.bottom }]}>
              {(canModerate(profileCard) || (isHost && !!profileCard.isGuestCard && profileCard.uid !== currentUid)) && (
                <TouchableOpacity style={styles.pcManage} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setManageOpen(true)}>
                  <Text style={styles.pcManageTxt}>Manage</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={0.85} style={styles.pcAvaWrap} onPress={() => goUserProfile(profileCard)}>
                <ExpoImage source={{ uri: profileCard.img || STABLE_AVATAR }} style={styles.pcAva} cachePolicy="memory-disk" transition={0} />
                {(Number(profileCard.level) >= 10 || !!profileCard.uid) && (
                  <LevelFrame level={Number(profileCard.level)} uid={profileCard.uid} lookup={false} animated photo={84} style={{ position: "absolute", width: 110, height: 110 }} />
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                <Text style={styles.pcName} numberOfLines={1}>{profileCard.name || profileCard.username || "User"}</Text>
                <UserTick uid={profileCard.uid || profileCard.userId || profileCard.senderId || profileCard.id} verified={!!profileCard.verified} verifiedColor={profileCard.verifiedColor} size={17} />
                {profileCard.uid === hostId && (
                  <View style={[styles.roleTag, { backgroundColor: "#F71084", marginLeft: 6 }]}><Text style={styles.roleTagTxt}>HOST</Text></View>
                )}
                {!!mods[profileCard.uid] && (
                  <View style={[styles.roleTag, { backgroundColor: "#2D9CFF", marginLeft: 6 }]}><Text style={styles.roleTagTxt}>MOD</Text></View>
                )}
                {!!mutedUsers[profileCard.uid] && (
                  <View style={[styles.roleTag, { backgroundColor: "#6b7280", marginLeft: 6 }]}><Text style={styles.roleTagTxt}>MUTED</Text></View>
                )}
              </View>

              {/* Followers / Following / Likes */}
              <View style={styles.pcStats}>
                <View style={styles.pcStat}><Text style={styles.pcStatN}>{pcInfo ? pcInfo.followers : "—"}</Text><Text style={styles.pcStatL}>Followers</Text></View>
                <View style={styles.pcStat}><Text style={styles.pcStatN}>{pcInfo ? pcInfo.following : "—"}</Text><Text style={styles.pcStatL}>Following</Text></View>
                <View style={styles.pcStat}><Text style={styles.pcStatN}>{pcInfo ? pcInfo.likes : "—"}</Text><Text style={styles.pcStatL}>Likes</Text></View>
              </View>

              {/* Level card  +  FAMILY card (sirf jab user family me ho) */}
              <View style={styles.pcCards}>
                {(() => {
                  const lv = Number(profileCard.level) || 1;
                  const th = getLevelTheme(lv);
                  return (
                    <TouchableOpacity activeOpacity={0.8} style={styles.pcCard} onPress={() => goUserProfile(profileCard)}>
                      <View style={[styles.pcLvPill, { backgroundColor: th.bg, borderColor: th.border }]}>
                        <MaterialCommunityIcons name="diamond-stone" size={13} color={th.icon} />
                        <Text style={[styles.pcLvTxt, { color: th.text }]}>{lv}LV</Text>
                      </View>
                      <Text style={styles.pcLvMore}>Level &gt;</Text>
                    </TouchableOpacity>
                  );
                })()}

                {!!pcInfo?.familyId && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.pcCard, { marginLeft: 10 }]}
                    onPress={() => { const fid = pcInfo.familyId; setProfileCard(null); router.push({ pathname: "/familyDetail", params: { id: fid } } as any); }}
                  >
                    <ExpoImage source={{ uri: pcInfo.familyLogo || STABLE_AVATAR }} style={styles.pcFamLogo} cachePolicy="memory-disk" transition={0} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.pcFamName} numberOfLines={1}>{pcInfo.familyName}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="people" size={12} color="#aaa" />
                        <Text style={styles.pcFamSub}> {pcInfo.familyMembers || 1}</Text>
                        <Ionicons name="flame-outline" size={12} color="#aaa" style={{ marginLeft: 8 }} />
                        <Text style={styles.pcFamSub}> {fmtPoints(pcInfo.familyPoints)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* Profile + Follow */}
              <View style={styles.pcMainBtns}>
                <TouchableOpacity style={styles.pcProfileBtn} onPress={() => goUserProfile(profileCard)}>
                  <Text style={styles.pcProfileTxt}>Profile</Text>
                </TouchableOpacity>
                {profileCard.uid !== currentUid && (
                  <TouchableOpacity
                    style={[styles.pcFollowBtn, profileFollowing && { backgroundColor: "#3a3a3a" }]}
                    onPress={toggleProfileFollow}
                  >
                    <Text style={[styles.pcFollowTxt, profileFollowing && { color: "#fff" }]}>{profileFollowing ? "Following" : "Follow"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Extra actions (gift / mod / mute / kick / report) */}
              {profileCard.uid !== currentUid && (
                <View style={styles.pcChips}>
                  {profileCard.isHostCard && !isHost && (
                    <TouchableOpacity style={[styles.pcChip, { backgroundColor: "#F59E0B" }]} onPress={() => { setProfileCard(null); openGiftModal(); }}>
                      <Text style={styles.pcChipTxt}>🎁 Send Gift</Text>
                    </TouchableOpacity>
                  )}
                  {isHost && profileCard.uid !== hostId && (
                    <TouchableOpacity style={[styles.pcChip, { backgroundColor: "#2D9CFF" }]} onPress={() => toggleMod(profileCard)}>
                      <Text style={styles.pcChipTxt}>{mods[profileCard.uid] ? "Remove mod" : "🛡 Make mod"}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.pcChip, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#4b5563" }]} onPress={() => { setReportTarget(profileCard); setProfileCard(null); }}>
                    <Text style={[styles.pcChipTxt, { color: "#f87171" }]}>⚑ Report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ---- Manage sheet: Mute / Kick Out / Cancel (Tiki) ---- */}
          {manageOpen && !!profileCard && (
            <View style={styles.mgOverlay}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPressIn={() => setManageOpen(false)} />
              <View style={[styles.mgSheet, { paddingBottom: 10 + insets.bottom }]}>
                {isHost && !!profileCard.isGuestCard && !!roomData?.guests?.[profileCard.uid] && (
                  <>
                    <TouchableOpacity
                      style={styles.mgRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        const gm = !!roomData?.guests?.[profileCard.uid]?.hostMuted;
                        setManageOpen(false);
                        setProfileCard(null);
                        muteGuest(profileCard.uid, !gm);
                      }}
                    >
                      <Text style={styles.mgTxt}>{roomData?.guests?.[profileCard.uid]?.hostMuted ? "Unmute guest" : "Mute guest"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mgRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        const uid = profileCard.uid;
                        setManageOpen(false);
                        setProfileCard(null);
                        removeGuest(uid);
                      }}
                    >
                      <Text style={[styles.mgTxt, { color: "#DC2626" }]}>Remove from call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mgRow} activeOpacity={0.7} onPress={() => setManageOpen(false)}>
                      <Text style={styles.mgTxt}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
                {!(isHost && !!profileCard.isGuestCard && !!roomData?.guests?.[profileCard.uid]) && (
                <>
                <TouchableOpacity
                  style={styles.mgRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setManageOpen(false);
                    muteUser(profileCard, !mutedUsers[profileCard.uid]);
                  }}
                >
                  <Text style={styles.mgTxt}>{mutedUsers[profileCard.uid] ? "Unmute" : "Mute"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mgRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setManageOpen(false);
                    setKickBlock(false);
                    setKickDlg(true);
                  }}
                >
                  <Text style={styles.mgTxt}>Kick Out</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mgRow} activeOpacity={0.7} onPress={() => setManageOpen(false)}>
                  <Text style={styles.mgTxt}>Cancel</Text>
                </TouchableOpacity>
                </>
                )}
              </View>
            </View>
          )}

          {/* ---- Kick Out confirm: "Add to Blocked List" ---- */}
          {kickDlg && !!profileCard && (
            <View style={styles.kdOverlay}>
              <View style={styles.kdBox}>
                <Text style={styles.kdTitle}>Do you want to kick out this viewer?</Text>
                <TouchableOpacity style={styles.kdChkRow} activeOpacity={0.7} onPress={() => setKickBlock((v) => !v)}>
                  <View style={[styles.kdChk, kickBlock && styles.kdChkOn]}>
                    {kickBlock && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.kdChkTxt}>Add to Blocked List</Text>
                </TouchableOpacity>
                <View style={styles.kdBtns}>
                  <TouchableOpacity style={[styles.kdBtn, { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#d4d4d8" }]} onPress={() => setKickDlg(false)}>
                    <Text style={styles.kdBtnTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.kdBtn} onPress={() => kickUser(profileCard, kickBlock)}>
                    <Text style={styles.kdBtnTxt}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

export function ChatMenuModal({ canDeleteChat, chatMenu, currentUid, deleteChatMsg, insets, openProfile, setChatMenu, setReportTarget, startReply }: any) {
  return (
    <>
      {/* ================= COMMENT MENU: Reply / Delete ================= */}
      <Modal transparent visible={!!chatMenu} animationType="fade" statusBarTranslucent onRequestClose={() => setChatMenu(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setChatMenu(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{chatMenu?.senderName || chatMenu?.username || "Comment"}</Text>
            {!!chatMenu?.message && <Text style={styles.sheetSub} numberOfLines={2}>{chatMenu.message}</Text>}
            {!chatMenu?.type && (
              <TouchableOpacity style={styles.reasonRow} onPress={() => startReply(chatMenu)}>
                <Text style={styles.reasonTxt}>Reply</Text>
                <Ionicons name="arrow-undo-outline" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
            {canDeleteChat(chatMenu) && (
              <TouchableOpacity style={styles.reasonRow} onPress={() => deleteChatMsg(chatMenu)}>
                <Text style={[styles.reasonTxt, { color: "#f87171" }]}>Delete</Text>
                <Ionicons name="trash-outline" size={16} color="#f87171" />
              </TouchableOpacity>
            )}
            {!!(chatMenu?.senderId || chatMenu?.uid) && (
              <TouchableOpacity
                style={styles.reasonRow}
                onPress={() => {
                  const c = chatMenu;
                  setChatMenu(null);
                  openProfile({ uid: c.senderId || c.uid, name: c.senderName, username: c.username, img: c.userImg, level: c.level, verified: c.verified, verifiedColor: c.verifiedColor });
                }}
              >
                <Text style={styles.reasonTxt}>View profile</Text>
                <Ionicons name="person-outline" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
            {!!chatMenu?.senderId && chatMenu.senderId !== currentUid && (
              <TouchableOpacity
                style={styles.reasonRow}
                onPress={() => {
                  const c = chatMenu;
                  setChatMenu(null);
                  setReportTarget({ uid: c.senderId, name: c.senderName });
                }}
              >
                <Text style={styles.reasonTxt}>Report</Text>
                <Ionicons name="flag-outline" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.reasonRow} onPress={() => setChatMenu(null)}>
              <Text style={styles.reasonTxt}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function ReportModal({ reportTarget, setReportTarget, submitReport }: any) {
  return (
    <>
      {/* ================= REPORT REASON ================= */}
      <Modal transparent visible={!!reportTarget} animationType="slide" onRequestClose={() => setReportTarget(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setReportTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Report {reportTarget?.name || "user"}</Text>
            <Text style={styles.sheetSub}>Why are you reporting?</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => submitReport(r)}>
                <Text style={styles.reasonTxt}>{r}</Text>
                <Ionicons name="chevron-forward" size={16} color="#6b7280" />
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function SettingsModal({ deleteAllChats, lockDraft, pinDraft, saveSettings, setLockDraft, setPinDraft, setSettingsVisible, setTitleDraft, settingsVisible, titleDraft }: any) {
  return (
    <>
      {/* ================= HOST SETUP (title / pinned / chat) ================= */}
      <Modal transparent visible={settingsVisible} animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setSettingsVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheet}>
              <Text style={styles.sheetTitle}>Live Setup</Text>

              <Text style={styles.fieldLbl}>Live title</Text>
              <TextInput
                style={styles.fieldInput}
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="e.g. Singing tonight 🎤"
                placeholderTextColor="#6b7280"
                maxLength={60}
              />

              <Text style={styles.fieldLbl}>Pinned message (shown to everyone)</Text>
              <TextInput
                style={[styles.fieldInput, { height: 70, textAlignVertical: "top" }]}
                value={pinDraft}
                onChangeText={setPinDraft}
                placeholder="Welcome! Follow & send gifts 💖"
                placeholderTextColor="#6b7280"
                multiline
                maxLength={140}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLblDark}>Turn off chat for viewers</Text>
                  <Text style={styles.pkRowSub}>You and moderators can still chat.</Text>
                </View>
                <Switch value={lockDraft} onValueChange={setLockDraft} trackColor={{ true: "#F71084", false: "#374151" }} />
              </View>

              <TouchableOpacity
                style={[styles.modBarBtn, { backgroundColor: "#DC2626", marginTop: 16, justifyContent: "center", paddingVertical: 11 }]}
                onPress={deleteAllChats}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.modBarTxt}>Delete all chats</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
                <Text style={styles.saveBtnTxt}>Save</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export function SummaryModal({ doLeaveNow, fmtDur, stars, summary }: any) {
  return (
    <>
      {/* ================= HOST: LIVE ENDED ================= */}
      <Modal transparent visible={!!summary} animationType="fade" onRequestClose={doLeaveNow}>
        <View style={styles.endBg}>
          <View style={styles.endHeader}>
            <TouchableOpacity onPress={doLeaveNow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.endHeaderTxt}>LIVE has ended</Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            <View style={styles.endCard}>
              <Text style={styles.endCardTitle}>Live Data</Text>
              <View style={styles.endGrid}>
                {[
                  { k: "Total Viewers", v: String(summary?.peak || 0) },
                  { k: "Stars earned", v: String(summary?.stars || 0) },
                  { k: "New Fans", v: String(summary?.followers || 0) },
                  { k: "LIVE Time", v: fmtDur(summary?.durationMs || 0) },
                ].map((c) => (
                  <View key={c.k} style={styles.endCell}>
                    <Text style={styles.endVal}>{c.v}</Text>
                    <Text style={styles.endLbl}>{c.k}</Text>
                  </View>
                ))}
              </View>
            </View>

            {(() => {
              const mins = Math.floor((summary?.durationMs || 0) / 60000);
              const pct = Math.min(100, Math.round((mins / WEEKLY_TARGET_MIN) * 100));
              const left = Math.max(0, WEEKLY_TARGET_MIN - mins);
              return (
                <View style={[styles.endCard, { flexDirection: "row", alignItems: "center" }]}>
                  <ProgressRing pct={pct}>
                    <Text style={styles.endPct}>{pct}%</Text>
                  </ProgressRing>
                  <View style={{ marginLeft: 22, flex: 1 }}>
                    <Text style={styles.endProgTitle}>Broadcast 2 hours live = 150 stars</Text>
                    <Text style={styles.endProgSub}>
                      {left > 0 ? `${left} more min to complete` : "Goal completed!"}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {!!summary?.gifters?.length && (
              <View style={styles.endCard}>
                <Text style={styles.endCardTitle}>Top gifters</Text>
                {summary.gifters.map((g: any, i: number) => (
                  <View key={g.uid} style={styles.sumGifter}>
                    <Text style={{ color: ["#FFD700", "#C0C0C0", "#CD7F32"][i], fontWeight: "800", width: 20 }}>{i + 1}</Text>
                    <Image source={{ uri: g.img || STABLE_AVATAR }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                    <Text style={styles.sumGifterName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <UserTick uid={g.uid} verified={!!g.verified} verifiedColor={g.verifiedColor} size={14} />
                    <Text style={styles.rankStars}>⭐ {g.stars}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.endCentre} onPress={doLeaveNow} activeOpacity={0.85}>
              <View style={styles.endCentreIcon}>
                <Ionicons name="mic" size={22} color="#111" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.endCentreTitle}>Done</Text>
                <Text style={styles.endCentreSub}>Back to home</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#111" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function GuestsMenuModals({ acceptGuest, guestList, guestSheetVisible, menuItems, menuVisible, onGuestTilePress, pendingRequests, rejectGuest, setGuestSheetVisible, setMenuVisible }: any) {
  return (
    <>
      {/* ================= TOOLS MENU (hamburger) ================= */}
      {/* ================= GUEST REQUESTS / GUESTS (host) ================= */}
      <Modal
        transparent
        visible={guestSheetVisible}
        animationType="slide"
        onRequestClose={() => setGuestSheetVisible(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setGuestSheetVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: height * 0.7 }]}>
            <Text style={styles.sheetTitle}>Guest call</Text>
            <Text style={styles.sheetSub}>
              {guestList.length}/{MAX_GUESTS} seats used · viewers can tap the gold link button to ask to join
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.guestSecTitle}>On the call</Text>
              {guestList.length === 0 ? (
                <Text style={styles.guestEmpty}>No one is on the call yet</Text>
              ) : (
                guestList.map((g: any) => (
                  <TouchableOpacity
                    key={g.uid}
                    activeOpacity={0.7}
                    style={styles.guestRow}
                    onPress={() => {
                      setGuestSheetVisible(false);
                      setTimeout(() => onGuestTilePress(g), 250);
                    }}
                  >
                    <ExpoImage source={{ uri: g.img || STABLE_AVATAR }} style={styles.guestRowAva} cachePolicy="memory-disk" transition={0} />
                    <Text numberOfLines={1} style={styles.guestRowName}>
                      {g.name || "Guest"}
                    </Text>
                    <UserTick uid={g.uid} verified={!!g.verified} verifiedColor={g.verifiedColor} size={14} />
                    {!!g.hostMuted && <Ionicons name="mic-off" size={15} color="#F71084" style={{ marginRight: 6 }} />}
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                ))
              )}

              <Text style={[styles.guestSecTitle, { marginTop: 16 }]}>Requests ({pendingRequests.length})</Text>
              {pendingRequests.length === 0 ? (
                <Text style={styles.guestEmpty}>No waiting requests</Text>
              ) : (
                pendingRequests.map((r: any) => (
                  <View key={r.uid} style={styles.guestRow}>
                    <ExpoImage source={{ uri: r.img || STABLE_AVATAR }} style={styles.guestRowAva} cachePolicy="memory-disk" transition={0} />
                    <Text numberOfLines={1} style={styles.guestRowName}>
                      {r.username || r.name || "Viewer"}
                    </Text>
                    <UserTick uid={r.uid} verified={isVerified(r.verified)} verifiedColor={r.verifiedColor} size={14} />
                    <TouchableOpacity style={[styles.guestBtn, { backgroundColor: "#2a2b38" }]} onPress={() => rejectGuest(r)}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.guestAccept, guestList.length >= MAX_GUESTS && { opacity: 0.4 }]}
                      disabled={guestList.length >= MAX_GUESTS}
                      onPress={() => acceptGuest(r)}
                    >
                      <Text style={styles.guestAcceptTxt}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={menuVisible} animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.menuGrid}>
              {menuItems.map((it: any) => (
                <TouchableOpacity
                  key={it.key}
                  style={styles.menuItem}
                  activeOpacity={0.8}
                  onPress={() => {
                    setMenuVisible(false);
                    setTimeout(() => it.onPress && it.onPress(), 280);
                  }}
                >
                  <View style={[styles.menuIcon, it.active && styles.menuIconOn]}>{it.icon}</View>
                  <Text style={styles.menuLbl} numberOfLines={1}>
                    {it.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function FilterModal({ applyFilter, filterId, filterModalVisible, insets, setFilterModalVisible }: any) {
  return (
    <>
      {/* ================= FILTER MODAL (host) ================= */}
      <Modal
        transparent
        visible={filterModalVisible}
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 28 : 14) + 20 }]}
          >
            <Text style={styles.sheetTitle}>Beauty & Filters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.id} style={styles.filterItem} onPress={() => applyFilter(f)}>
                  <View style={[styles.filterCircle, filterId === f.id && styles.filterCircleActive]}>
                    <Text style={{ fontSize: 24 }}>{f.icon}</Text>
                  </View>
                  <Text style={[styles.filterLabel, filterId === f.id && { color: "#F71084" }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
