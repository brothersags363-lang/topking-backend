// @ts-nocheck
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, KeyboardAvoidingView, Animated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import LevelFrame from '../../components/LevelFrame';
import { RtcSurfaceView } from 'react-native-agora';
import UserTick from '../../components/UserTick';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { STABLE_AVATAR, PK_RESULT_SHOW_MS, width, height } from './constants';
import { GiftButtonLottie, WeeklyMinutesPill, MatchTimer, ChatBoxInput } from './LiveWidgets';
import { PkTimerPill, PkGlovesVs, PkCenterTrophy, PkPanelResult, PkFinalCountdown } from './PkWidgets';
import { PkLoserPunish } from './PkLoserPunish';
import { SEAT_COL, SEAT_BADGE, PkSeats, PkWaiting, PkTicker } from './PkSeats';
import { styles, TOP_CHIP_AVA } from './styles';

export function BackgroundStage({ camFrontRef, hostImg, hostRemoteUid, hostVideoOff, isHost, mainVideoArea, myResult, oppRemoteUid, oppResult, oppRoom, pausedOverlay, pk, pkActive, pkBarAnim, pkBarTop, pkConn, pkEnded, pkPanelH, pkPanelTop, pkPanelW, pkSideAnim, showLocalVideo, showPk, showRemoteVideo, shownMy, shownOpp, videoOff }: any) {
  return (
    <>
      {/* ================= BACKGROUND VIDEO / PK STAGE ================= */}
      {!showPk ? (
        <>
          {mainVideoArea()}
          {isHost && videoOff && pausedOverlay("Your video is paused", StyleSheet.absoluteFill)}
          {!isHost && hostVideoOff && pausedOverlay("Host paused the video", StyleSheet.absoluteFill)}
        </>
      ) : (
        <>
          {/* Tiki background: navy -> purple gradient (no flat black) */}
          <LinearGradient
            colors={["#0F0D33", "#1A1450", "#2C2168", "#3B2B7D"]}
            locations={[0, 0.35, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(40,110,255,0.38)", "rgba(40,110,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", top: 0, left: 0, width: width * 0.7, height: 230 }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,45,117,0.32)", "rgba(255,45,117,0)"]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: "absolute", top: 0, right: 0, width: width * 0.7, height: 230 }}
          />

          {/* score bar: BLUE (me) | PINK (opponent) */}
          <View style={[styles.pkBarWrap, { top: pkBarTop }]}>
            <View style={styles.pkBar}>
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: "#1E8CFF",
                  transform: [{ translateX: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: [-width, 0] }) }],
                }}
              />
            </View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pkSpark,
                { left: 0, transform: [{ translateX: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: [0, width] }) }] },
              ]}
            >
              <View style={styles.pkSparkGlow} />
            </Animated.View>
            <View pointerEvents="none" style={[styles.pkScoreWrap, { left: 4 }]}>
              <View style={styles.pkStarBox}>
                <Ionicons name="star" size={11} color="#1E8CFF" />
              </View>
              <Text style={styles.pkScoreTxt}>{shownMy}</Text>
            </View>
            <View pointerEvents="none" style={[styles.pkScoreWrap, { right: 4 }]}>
              <Text style={styles.pkScoreTxt}>{shownOpp}</Text>
              <View style={styles.pkStarBox}>
                <Ionicons name="star" size={11} color="#FF2D75" />
              </View>
            </View>
          </View>

          {/* two video panels */}
          <View style={[styles.pkPanels, { top: pkPanelTop, height: pkPanelH }]}>
            {/* LEFT = this room's host */}
            <View style={{ width: pkPanelW, height: pkPanelH, backgroundColor: "#1B1545" }}>
              {showLocalVideo ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: 0 }} />
              ) : showRemoteVideo ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: hostRemoteUid as number }} />
              ) : (
                <PkWaiting img={hostImg} />
              )}
              {(isHost ? videoOff : hostVideoOff) && pausedOverlay("Video paused", StyleSheet.absoluteFill, false)}
                            {pkEnded && !!myResult && <PkPanelResult key={`res_me_${pk?.pkId}`} result={myResult} endedAt={pk?.endedAt} />}
              {pkEnded && myResult === "lose" && <PkLoserPunish key={`pun_me_${pk?.pkId}`} panelW={pkPanelW} panelH={pkPanelH} face={pk?.face} mirror={isHost && camFrontRef.current} />}
              <PkSeats gifters={pk?.gifters} mirror />
            </View>

            {/* RIGHT = opponent host (their channel) */}
            <View style={{ width: pkPanelW, height: pkPanelH, backgroundColor: "#1B1545" }}>
              {oppRemoteUid && pkConn ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: oppRemoteUid }} connection={pkConn} />
              ) : (
                <PkWaiting img={pk?.opponentImg} loading={pkActive} />
              )}
              {pkEnded && !!myResult && <PkPanelResult key={`res_opp_${pk?.pkId}`} result={oppResult} endedAt={pk?.endedAt} />}
              {pkEnded && oppResult === "lose" && <PkLoserPunish key={`pun_opp_${pk?.pkId}`} panelW={pkPanelW} panelH={pkPanelH} face={oppRoom?.pk?.face} mirror={false} />}
              <PkSeats gifters={oppRoom?.pk?.gifters} />
            </View>

            {/* viewer ki side: glow border (native-driven, smooth) + hint doosri side par */}
            {!isHost && pkActive && !!pk?.opponentHostId && (
              <>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pkSideGlow,
                    { left: 0, width: pkPanelW, height: pkPanelH, borderColor: "#1E8CFF", opacity: pkSideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pkSideGlow,
                    { left: pkPanelW, width: pkPanelW, height: pkPanelH, borderColor: "#FF2D75", opacity: pkSideAnim },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pkSideHint, { left: 0, width: pkPanelW, opacity: pkSideAnim }]}
                >
                  <Text style={styles.pkSideHintTxt}>Tap to join & support</Text>
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pkSideHint,
                    { left: pkPanelW, width: pkPanelW, opacity: pkSideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                  ]}
                >
                  <Text style={styles.pkSideHintTxt}>Tap to join & support</Text>
                </Animated.View>
              </>
            )}

            {/* gloves + lightning in the middle */}
            {pkActive && Date.now() - (pk?.startAt || 0) < 3500 && <PkGlovesVs key={`vs_${pk?.pkId}`} startAt={pk?.startAt} />}

            {/* big trophy in the middle right after the PK ends */}
            {pkEnded && !!myResult && <PkCenterTrophy key={`ct_${pk?.pkId}`} result={myResult} endedAt={pk?.endedAt} />}

            {/* countdown (own component → no whole-screen re-render) */}
            {pkActive && !!pk?.endAt && <PkTimerPill key={`timer_${pk?.pkId}`} endAt={pk.endAt} />}
            {/* last 10 seconds: big 10 9 8 ... 1 */}
            {pkActive && !!pk?.endAt && <PkFinalCountdown key={`fcd_${pk?.pkId}`} endAt={pk.endAt} />}
            {/* after the PK: "00:09" result countdown (Tiki) */}
            {pkEnded && !!pk?.endedAt && (
              <PkTimerPill key={`rtimer_${pk?.pkId}`} endAt={Number(pk.endedAt) + PK_RESULT_SHOW_MS} result />
            )}
          </View>

          {/* scrolling tip under the panels */}
          <PkTicker top={pkPanelTop + pkPanelH + 8} />
        </>
      )}
    </>
  );
}

export function PkPills({ currentUid, followGuest, hostId, hostImg, hostName, iFollowId, isFriendId, oppMuted, oppRemoteUid, pk, pkActive, pkPanelH, pkPanelTop, pkPanelW, showPk, toggleOppMute }: any) {
  return (
    <>
      {/* PK: name pills + follow / Friend + mute -> tap overlay ke UPAR (warna tap nahi pakadte) */}
      {showPk && (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: pkPanelTop, height: pkPanelH, flexDirection: "row" }}>
          <View pointerEvents="box-none" style={{ width: pkPanelW, height: pkPanelH }}>
              {/* left host name + follow "+" / Friend (viewers + opponent host dekh sakte hain) */}
              {!!hostId && (
                <View style={[styles.pkOppPill, { right: undefined, left: 6, paddingLeft: 9, paddingRight: hostId === currentUid ? 9 : 3 }]}>
                  <Text numberOfLines={1} style={styles.pkOppName}>
                    {hostName}
                  </Text>
                  {hostId !== currentUid && (iFollowId(hostId) ? (
                    <View style={[styles.pkFriendTag, !isFriendId(hostId) && styles.pkFollowingTag]}>
                      <Ionicons name={isFriendId(hostId) ? "people" : "checkmark"} size={9} color="#fff" />
                      <Text style={styles.pkFriendTxt}>{isFriendId(hostId) ? "Friend" : "Following"}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.pkOppPlus}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => followGuest({ uid: hostId, name: hostName, img: hostImg })}
                    >
                      <Ionicons name="add" size={13} color="#111" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
          </View>
          <View pointerEvents="box-none" style={{ width: pkPanelW, height: pkPanelH }}>
                            {pkActive && !!oppRemoteUid && (
                <TouchableOpacity style={styles.pkMuteBtn} onPress={toggleOppMute} activeOpacity={0.8}>
                  <Ionicons name={oppMuted ? "volume-mute" : "volume-high"} size={14} color="#fff" />
                </TouchableOpacity>
              )}
              {/* opponent name + yellow follow "+" (top-right, like Tiki) */}
              <View style={styles.pkOppPill}>
                <Text numberOfLines={1} style={styles.pkOppName}>
                  {pk?.opponentName || "Opponent"}
                </Text>
                {!!pk?.opponentHostId && pk.opponentHostId !== currentUid && (
                  iFollowId(pk.opponentHostId) ? (
                    <View style={[styles.pkFriendTag, !isFriendId(pk.opponentHostId) && styles.pkFollowingTag]}>
                      <Ionicons name={isFriendId(pk.opponentHostId) ? "people" : "checkmark"} size={9} color="#fff" />
                      <Text style={styles.pkFriendTxt}>{isFriendId(pk.opponentHostId) ? "Friend" : "Following"}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.pkOppPlus}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => followGuest({ uid: pk.opponentHostId, name: pk.opponentName, img: pk.opponentImg })}
                    >
                      <Ionicons name="add" size={13} color="#111" />
                    </TouchableOpacity>
                  )
                )}
              </View>
          </View>
        </View>
      )}
    </>
  );
}

export function GuestTiles({ currentUid, followGuest, followingIds, guestCamOn, guestFollowed, guestList, guestMicOn, guestPublishingRef, hostId, hostMutedMe, insets, isFollowing, isHost, myVerified, myVerifiedColor, onGuestTilePress, remoteVideoOn, showPk }: any) {
  return (
    <>
      {/* ================= GUEST TILES (viewers on the call with the host) ================= */}
      {!showPk && guestList.length > 0 && (
        <View
          pointerEvents="box-none"
          style={[
            styles.guestColumn,
            // TopKing Event button (bottom+62, ~58px height) ke thik upar se guests niche se start hon
            { bottom: (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) + 62 + 60 + 40 },
          ]}
        >
          {guestList.map((g: any) => {
            const isMe = g.uid === currentUid;
            const aid = Number(g.agoraUid || 0);
            const videoOn = isMe ? guestCamOn && guestPublishingRef.current : !!aid && remoteVideoOn[aid] === true;
            const micOff = isMe ? hostMutedMe || !guestMicOn : !!g.hostMuted;
            const followed = followingIds.has(g.uid) || guestFollowed.has(g.uid) || (g.uid === hostId && isFollowing);
            return (
              <TouchableOpacity
                key={g.uid}
                activeOpacity={0.9}
                onPress={() => onGuestTilePress(g)}
                style={styles.guestTile}
              >
                {videoOn ? (
                  <RtcSurfaceView
                    style={StyleSheet.absoluteFill}
                    canvas={{ uid: isMe ? 0 : aid }}
                    zOrderMediaOverlay
                  />
                ) : (
                  <View style={styles.guestAvaWrap}>
                    <View style={styles.guestAvaRing}>
                      <ExpoImage source={{ uri: g.img || STABLE_AVATAR }} style={styles.guestAva} cachePolicy="memory-disk" transition={0} />
                    </View>
                  </View>
                )}
                {micOff && (
                  <View style={styles.guestMicOff}>
                    <Ionicons name="mic-off" size={11} color="#fff" />
                  </View>
                )}
                <View style={styles.guestNameRow}>
                  <Text numberOfLines={1} style={styles.guestNameTxt}>
                    {isMe ? "You" : g.name || "Guest"}
                  </Text>
                  <UserTick uid={g.uid} verified={isMe ? !!myVerified : !!g.verified} verifiedColor={isMe ? myVerifiedColor : g.verifiedColor} size={12} />
                  {!isMe && !isHost && !followed && (
                    <TouchableOpacity
                      style={styles.guestPlus}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => followGuest(g)}
                    >
                      <Ionicons name="add" size={14} color="#111" />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}

export function TopHeader({ currentUid, followBusy, headerFive, hostId, hostImg, hostLevel, hostMicMuted, hostName, hostStars, hostVerified, hostVerifiedColor, isFollowing, isHost, netQuality, openHostCard, roomStartTime, safeTop, setExitModalVisible, setProfileCard, setViewerListVisible, showPk, toggleFollowHost, viewerCount }: any) {
  return (
    <>
      {/* ================= TOP HEADER ================= */}
      <View style={[styles.topHeader, { top: safeTop + 12 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.hostPill}>
            <TouchableOpacity activeOpacity={0.85} onPress={openHostCard} style={styles.hostAvatarContainer}>
              <ExpoImage source={{ uri: hostImg }} style={styles.hostAvatarImg} cachePolicy="memory-disk" transition={0} />
              {(hostLevel >= 10 || !!hostId) && (
                <LevelFrame level={hostLevel} uid={hostId} lookup={false} animated={false} photo={34} style={styles.hostLevelFrame} />
              )}
            </TouchableOpacity>

            <View style={{ marginLeft: 8, flexShrink: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.hostNameText} numberOfLines={1}>
                  {hostName}
                </Text>
                <UserTick uid={hostId} verified={!!hostVerified} verifiedColor={hostVerifiedColor} size={14} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="star" size={11} color="#FFE600" />
                <Text style={[styles.starsText, { color: "#fff", marginLeft: 3 }]}>{hostStars}</Text>
              </View>
            </View>

            {!isHost && !!hostId && hostId !== currentUid && !isFollowing && (
              <TouchableOpacity onPress={toggleFollowHost} disabled={followBusy} style={styles.followPlus}>
                <Ionicons name="add" size={18} color="#000" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.rightGroup}>
            <View style={styles.topStack}>
              {headerFive.map((u: any, i: number) => (
                <TouchableOpacity
                  key={u.uid}
                  activeOpacity={0.8}
                  style={styles.topChip}
                  onPress={() =>
                    setProfileCard({
                      uid: u.uid,
                      name: u.name || u.username,
                      username: u.username,
                      img: u.img,
                      level: u.level,
                      verified: u.verified,
                      verifiedColor: u.verifiedColor,
                    })
                  }
                >
                  <Image
                    source={{ uri: u.img || STABLE_AVATAR }}
                    style={[styles.topChipAva, { borderColor: u.isGifter && i < 3 ? SEAT_COL[i] : "rgba(255,255,255,0.85)" }]}
                  />
                  {/* FRAME: har listener ka apna frame (level / SVIP / admin) - baaki app jaisa.
                      uid se asli level apne aap aata hai (gifter list me level na ho tab bhi frame dikhe). */}
                  <LevelFrame
                    uid={u.uid}
                    level={u.level}
                    photo={TOP_CHIP_AVA}
                    style={styles.topChipFrame}
                  />
                  {u.isGifter && i < 3 && (
                    <>
                      {i === 0 && <Text style={styles.topChipCrown}>👑</Text>}
                      <View style={[styles.topChipTag, { backgroundColor: SEAT_BADGE[i] }]}>
                        <Text style={styles.topChipTagTxt}>TOP{i + 1}</Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity activeOpacity={0.8} style={styles.viewerCountCircle} onPress={() => setViewerListVisible(true)}>
                <Text style={styles.viewerStackCount}>{viewerCount}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setExitModalVisible(true)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {!showPk && (
        <View style={styles.weeklyRow}>
          <View style={styles.weeklyTag}>
            <Ionicons name="stats-chart" size={12} color="#FFD700" />
            <Text style={styles.weeklyTxt}>Weekly Host</Text>
          </View>
          {isHost && <WeeklyMinutesPill startTime={roomStartTime} />}
          {hostMicMuted && <Ionicons name="mic-off" size={13} color="#fff" style={{ marginLeft: 8 }} />}
          {netQuality > 0 && (
            <Ionicons
              name="cellular"
              size={13}
              color={netQuality >= 4 ? "#FF5252" : netQuality === 3 ? "#FFC107" : "#69F0AE"}
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
        )}
      </View>
    </>
  );
}

export function BottomControls({ filterId, setFilterModalVisible, amGuest, chatInputRef, chatOpen, handleSendChat, handleShare, insets, isHost, keyboardHeight, matchMini, matchStartRef, matching, myReqPending, onPkButton, openChat, openGiftModal, pendingRequests, pkActive, sendGuestRequest, setEmojiOpen, setGuestSheetVisible, setMatchMini, setMenuVisible, showInvite, showPk }: any) {
  return (
    <>
      {/* ================= BOTTOM BAR ================= */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        style={[
          styles.bottomNav,
          {
            bottom: keyboardHeight,
            paddingBottom: Platform.OS === "android" ? insets.bottom + 8 : insets.bottom,
          },
        ]}
      >
        {chatOpen ? (
          <>
            <View style={styles.inputBox}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ChatBoxInput
                  ref={chatInputRef}
                  style={[styles.inputStyle, { flex: 1 }]}
                  onSubmit={handleSendChat}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setEmojiOpen((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 20 }}>😊</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.sendBtn} onPress={handleSendChat}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.chatPill} onPress={openChat} activeOpacity={0.8}>
              <Ionicons name="chatbubble-outline" size={22} color="#fff" />
              <Text style={styles.chatPillTxt}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleBtn} onPress={handleShare}>
              <Ionicons name="arrow-redo" size={23} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleBtn} onPress={() => setMenuVisible(true)}>
              <Ionicons name="menu" size={26} color="#fff" />
            </TouchableOpacity>

            {isHost && (
              <TouchableOpacity
                style={[styles.circleBtn, filterId !== "off" && styles.circleBtnOn]}
                onPress={() => setFilterModalVisible(true)}
              >
                <MaterialCommunityIcons name="face-woman-shimmer-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}

            {!showPk && (
            <TouchableOpacity
              style={[styles.circleBtn, amGuest && styles.circleBtnOn]}
              onPress={isHost ? () => setGuestSheetVisible(true) : sendGuestRequest}
            >
              <MaterialCommunityIcons
                name={amGuest ? "phone-in-talk" : "link-variant"}
                size={20}
                color={amGuest ? "#fff" : myReqPending ? "#9aa0b4" : "#FFC107"}
              />
              {isHost && pendingRequests.length > 0 && (
                <View style={styles.guestBadge}>
                  <Text style={styles.guestBadgeTxt}>{Math.min(pendingRequests.length, 9)}</Text>
                </View>
              )}
            </TouchableOpacity>
            )}

            <View style={{ flex: 1 }} />

            {isHost ? (
              <>
                {pkActive && (
                  <TouchableOpacity style={styles.giftCircle} onPress={openGiftModal}>
                    <GiftButtonLottie />
                  </TouchableOpacity>
                )}
                {matching && matchMini ? (
                  <TouchableOpacity style={styles.matchMiniPill} onPress={() => setMatchMini(false)}>
                    <Text style={styles.matchMiniTxt}>Matching...</Text>
                    <MatchTimer startAt={matchStartRef.current} style={styles.matchMiniTime} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.pkBadgeBtn, pkActive && styles.pkEndBtn]}
                    onPress={onPkButton}
                    activeOpacity={0.8}
                  >
                    {pkActive ? (
                      <Text style={styles.pkBadgeBtnTxt}>END</Text>
                    ) : (
                      <Text style={styles.pkLogoBtnTxt}>
                        <Text style={{ color: "#35C8FF" }}>P</Text>
                        <Text style={{ color: "#FF3D9A" }}>K</Text>
                      </Text>
                    )}
                    {showInvite && <View style={styles.pkBadgeDot} />}
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <TouchableOpacity style={styles.giftCircle} onPress={openGiftModal}>
                <GiftButtonLottie />
              </TouchableOpacity>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </>
  );
}
