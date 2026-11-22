import PERF from '../../utils/devicePerf';
import { pickVideoUri, fixCdn } from '../../utils/videoSource';
import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, Animated } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLiveHost } from '../liveHosts';
import UserTick, { isFaceVerified } from '../UserTick';
import { AvatarFrame } from '../FramedAvatar';
import { AVATAR_FALLBACK, formatCount, height, width } from './feedShared';
import { FeedVideo } from './FeedVideo';
import { LikeButton, HeartPopup } from './LikeButton';
import { FollowPill, ProfilePlus } from './FollowButtons';
import { styles } from './feedStyles';

// ======================================================
// VideoItem — memoized single feed row
// ======================================================
// FIX (biggest perf change): pehle ye poora JSX seedha renderItem
// ke andar tha, aur renderItem ek useCallback tha jiski dependency
// list me activeVideo/currentIndex/pausedVideoId/localLikes/
// followingUsers/starAnimationVideoId the -- yani scroll ke har
// step par, ya kahin bhi like/follow hone par, renderItem ki
// identity badal jaati thi. Isse FlatList currently-mounted SAARE
// cells ko re-render kar deta tha, sirf jo actually change hua wo
// nahi.
//
// Ab actual row JSX ek alag React.memo() component me hai. renderItem
// ab sirf is item ke liye zaroori props compute karke <VideoItem/>
// return karta hai. React.memo apne aap shallow-compare karke sirf
// UN cells ko re-render karega jinke props sach me badle hain --
// baaki sab as-is rahenge. Isse scroll aur like/follow tap dono
// kaafi zyada smooth feel honge.
export const VideoItem = memo(function VideoItem({
  itemHeight,
  fullHeight,
  item,
  index,
  shouldRenderVideo,
  nearVideo,
  isVideoActive,
  isCurrent,
  isPaused,
  showHeart,
  heartTick,
  showStar,
  starCount,
  isLiked,
  followState,
  rotateAnim,
  textAnim,
  starScale,
  starOpacity,
  starRotate,
  starJump,
  starTilt,
  onItemPress,
  onLike,
  onFollow,
  onOpenComments,
  onOpenShare,
  onOpenStar,
  onOpenProfile,
  onOpenMusic,
}) {
  // Is video ka creator abhi live hai? (shared single listener)
  const hostLive = useLiveHost(item.userId);

  // SMOOTH: interpolate har render par naya native node banata tha -> ek baar banao
  const discRotate = useMemo(
    () => rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
    [rotateAnim]
  );

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={{ width, height: itemHeight, backgroundColor: '#000' }}
      onPress={() => onItemPress(item.id)}
    >

      {shouldRenderVideo ? (
        <FeedVideo
          uri={pickVideoUri(item, PERF.quality())}
          active={isVideoActive}
          near={nearVideo}
          videoId={item.id}
          isCurrent={isCurrent}
          thumbnail={item.thumbnail}
        />
      ) : item.thumbnail ? (
        <ExpoImage source={fixCdn(item.thumbnail)} style={{ width, height: itemHeight, backgroundColor: "#000" }} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} />
      ) : (
        <View
          style={{
            width,
            height: itemHeight,
            backgroundColor: "#000"
          }}
        />
      )}

      {/* OVERLAY LAYER: poori screen ki height (fullHeight) ka, upar se aligned.
          Isse caption / icons / heart bilkul pehle wali jagah par rehte hain,
          chahe video ab nav bar ke upar tak hi ho. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, width, height: fullHeight }}
      >
      {showHeart && <HeartPopup key={heartTick} />}

      {/* PAUSE INDICATOR: tap se video ruke to beech me play icon (taaki pata chale video band hai) */}
      {isPaused && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height: itemHeight,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              backgroundColor: 'rgba(0,0,0,0.55)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="play" size={34} color="#ffffff" style={{ marginLeft: 4 }} />
          </View>
        </View>
      )}

      {showStar && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 99999,
            elevation: 99999,
          }}
          pointerEvents="none"
        >
          {/* Background transparent -- sirf star + uske upar count */}
          <Animated.View
            style={{
              width: 150,
              height: 150,
              justifyContent: "center",
              alignItems: "center",
              opacity: starOpacity,
              transform: [{ scale: starScale }],
            }}
          >
            <Image
              source={require("../../assets/star-logo.webp")}
              style={{ width: 150, height: 150, resizeMode: "contain" }}
            />

            {/* Chamak (shine): star ke upar safed flash, starRotate yahan shine value hai */}
            <Animated.Image
              source={require("../../assets/star-logo.webp")}
              style={{
                position: "absolute",
                width: 150,
                height: 150,
                resizeMode: "contain",
                tintColor: "#ffffff",
                opacity: starRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.65],
                }),
              }}
            />

            {/* Star ke upar count: 1 / 3 / 10 */}
            <Text
              style={{
                position: "absolute",
                fontSize: 44,
                fontWeight: "900",
                color: "#ffffff",
                textShadowColor: "rgba(0,0,0,0.55)",
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 6,
              }}
            >
              {starCount}
            </Text>
          </Animated.View>
        </View>
      )}

      <View style={styles.overlay} />
      <View style={styles.bottomLeft}>

        <View style={styles.userRow}>
          <Text style={[styles.userName, { flexShrink: 1 }]} numberOfLines={1}>
            {item.username || "@user"}
          </Text>

          <UserTick uid={item.userId} verified={item.verified} verifiedColor={item.verifiedColor} faceVerified={isFaceVerified(item)} size={17} />

          <FollowPill userId={item.userId} followState={followState} onFollow={onFollow} />
        </View>

        <Text style={styles.caption} numberOfLines={1} ellipsizeMode="tail">{item.caption}</Text>

        <TouchableOpacity
          style={styles.musicRow}
          activeOpacity={0.8}
          onPress={() => onOpenMusic(item)}
        >
          <Animated.View
            style={[
              styles.musicDiscOuter,
              {
                transform: [{ rotate: discRotate }],
              },
            ]}
          >
            <View style={styles.vinylDisc}>
              <ExpoImage source={item.profile || AVATAR_FALLBACK} style={styles.musicCenterImage} contentFit="cover" cachePolicy="memory-disk" />
              <View style={styles.musicDot} />
            </View>
          </Animated.View>

          <View style={styles.musicTextContainer}>
            <Animated.Text
              style={[
                styles.musicText,
                {
                  transform: [
                    { translateX: textAnim }
                  ]
                }
              ]}
              numberOfLines={1}
            >
              🎵 Music • {item.username} • Original Audio
            </Animated.Text>
          </View>
        </TouchableOpacity>

      </View>

      <View style={styles.rightIcons}>

        <View style={[styles.iconBox, { marginBottom: 20 }]}>
          <TouchableOpacity onPress={() => onOpenProfile(item.userId)}>
            <ExpoImage source={item.profile || AVATAR_FALLBACK} style={[styles.profileImage, hostLive && styles.profileImageLive]} contentFit="cover" cachePolicy="memory-disk" />
            {/* FRAME: video banane wale ka frame (level / agency / admin / user ki choice) */}
            <AvatarFrame uid={item.userId} size={50} animated={false} />
            {hostLive && (
              <View style={styles.liveTagFeed} pointerEvents="none">
                <Text style={styles.liveTagFeedText}>LIVE</Text>
              </View>
            )}
          </TouchableOpacity>

          <ProfilePlus userId={item.userId} followState={followState} onFollow={onFollow} />

        </View>

        <LikeButton
          liked={isLiked}
          count={item.likes}
          videoId={item.id}
          onLike={onLike}
        />

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenComments(item)}
        >
          <Ionicons name="chatbubble-ellipses" size={40} color="#ffffff" style={styles.iconShadow} />
          <Text style={styles.iconText}>{formatCount(item.commentsCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenShare(item)}
        >
          <Ionicons name="arrow-redo" size={42} color="#ffffff" style={styles.iconShadow} />
          <Text style={styles.iconText}>{formatCount(item.shares)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenStar(item.id)}
        >
          <Image
            source={require('../../assets/star-logo.webp')}
            style={styles.starImage}
          />
          <Text style={styles.starUpText}>StarUp</Text>
        </TouchableOpacity>
      </View>
      </View>
    </TouchableOpacity>
  );
});


