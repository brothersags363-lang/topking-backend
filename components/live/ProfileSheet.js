// ProfileSheet - sab live rooms ka SAME profile popup (bottom sheet)
// avatar, naam, Followers/Following/Likes, Level card, FAMILY card (agar family me ho), Profile + Follow
// Use: LiveRoom, LivePrivate, MultiGuestRoom, videolive
import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { useRouter } from "../../utils/safeRouter";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import LevelFrame from "../LevelFrame";
import UserTick from "../UserTick";
import { fmtPoints } from "../../utils/familyUtils";

// children (fragments ke andar bhi) ko flat list banao
const flatten = (nodes) => {
  const out = [];
  React.Children.forEach(nodes, (c) => {
    if (!c) return;
    if (c.type === React.Fragment) out.push(...flatten(c.props.children));
    else out.push(c);
  });
  return out;
};

const AVATAR = "https://avatar.iran.liara.run/public/65";
const YELLOW = "#FFE62B";

/**
 * Props
 *  db, visible, onClose
 *  user: { uid, name, img, level, verified, verifiedColor }
 *  levelTheme: { bg, border, text, icon }   (getLevelTheme(level))
 *  avatar?: ReactNode            (custom avatar, e.g. <ProfileAvatar/>) - nahi diya to Image + LevelFrame
 *  tags?: ReactNode              (HOST / MOD badges, naam ke saath)
 *  stats?: { followers, following, likes, loading }  (nahi diya to users doc se khud laata hai)
 *  isMe, following, followBack, followBusy, onFollow
 *  onProfile()                   (Profile button / Level card)
 *  topRight?: ReactNode          (extra)
 *  ModalComponent?               (LiveRoom/LivePrivate me SafeModal pass karo)
 *  bottomInset, children         (children = extra action chips)
 */
export default function ProfileSheet({
  db, visible, onClose, user, levelTheme, avatar, tags, stats, isMe, following, followBack,
  followBusy, onFollow, onProfile, bottomInset = 0, ModalComponent = Modal, children,
}) {
  const router = useRouter();
  const uid = user?.uid;
  const [info, setInfo] = useState(null);

  useEffect(() => {
    setInfo(null);
    if (!visible || !uid || !db) return;
    let alive = true;
    (async () => {
      try {
        const u = (await getDoc(doc(db, "users", uid))).data() || {};
        const base = {
          followers: Number(u.followersCount || 0),
          following: Number(u.followingCount || 0),
          likes: Number(u.likesCount || u.totalLikes || 0),
          familyId: u.familyId || "", familyName: u.familyName || "", familyLogo: u.familyLogo || "",
          familyPoints: 0, familyMembers: 0,
        };
        if (alive) setInfo(base);
        if (base.familyId) {
          const f = (await getDoc(doc(db, "families", base.familyId))).data();
          if (!alive) return;
          if (f && f.status === "approved") {
            setInfo({ ...base, familyName: f.name || base.familyName, familyLogo: f.logo || base.familyLogo,
              familyPoints: Number(f.points || 0), familyMembers: Number(f.memberCount || 1) });
          } else {
            setInfo({ ...base, familyId: "" }); // family band / reject -> card nahi
          }
        }
      } catch (e) {}
    })();
    return () => { alive = false; };
  }, [visible, uid, db]);

  if (!user) return null;
  const lv = Number(user.level) || 1;
  const th = levelTheme || { bg: "#7B1FFF", border: "#fff", text: "#fff", icon: "#fff" };
  const loading = stats ? !!stats.loading : !info;
  const val = (k) => (loading ? "—" : String(stats ? stats[k] ?? 0 : info?.[k] ?? 0));
  const goFamily = () => {
    const fid = info?.familyId;
    if (!fid) return;
    onClose && onClose();
    router.push({ pathname: "/familyDetail", params: { id: fid } });
  };

  const items = flatten(children);
  const half = Math.ceil(items.length / 2);
  const leftItems = items.slice(0, half);
  const rightItems = items.slice(half);

  return (
    <ModalComponent transparent visible={!!visible} animationType="slide" statusBarTranslucent hardwareAccelerated onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: 16 + bottomInset }]}>
          <View style={s.topRow}>
            <View style={[s.side, { alignItems: "flex-start" }]}>{leftItems}</View>
            <TouchableOpacity activeOpacity={0.9} onPress={onProfile} style={s.avaWrap}>
              {avatar || (
                <>
                  <Image source={{ uri: user.img || AVATAR }} style={s.ava} />
                  {(lv >= 10 || !!uid) && (
                    <LevelFrame level={lv} uid={uid} animated style={{ position: "absolute", width: 110, height: 110 }} />
                  )}
                </>
              )}
            </TouchableOpacity>
            <View style={[s.side, { alignItems: "flex-end" }]}>{rightItems}</View>
          </View>

          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{user.name || user.username || "User"}</Text>
            <UserTick uid={uid} verified={!!user.verified} verifiedColor={user.verifiedColor} size={17} />
            {tags}
          </View>

          <View style={s.stats}>
            <View style={s.stat}><Text style={s.statN}>{val("followers")}</Text><Text style={s.statL}>Followers</Text></View>
            <View style={s.stat}><Text style={s.statN}>{val("following")}</Text><Text style={s.statL}>Following</Text></View>
            <View style={s.stat}><Text style={s.statN}>{val("likes")}</Text><Text style={s.statL}>Likes</Text></View>
          </View>

          <View style={s.cards}>
            <TouchableOpacity activeOpacity={0.8} style={s.card} onPress={onProfile}>
              <View style={[s.lvPill, { backgroundColor: th.bg, borderColor: th.border }]}>
                <MaterialCommunityIcons name="diamond-stone" size={13} color={th.icon} />
                <Text style={[s.lvTxt, { color: th.text }]}>{lv}LV</Text>
              </View>
              <Text style={s.lvMore}>Level &gt;</Text>
            </TouchableOpacity>

            {!!info?.familyId && (
              <TouchableOpacity activeOpacity={0.8} style={[s.card, { marginLeft: 10 }]} onPress={goFamily}>
                <Image source={{ uri: info.familyLogo || AVATAR }} style={s.famLogo} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.famName} numberOfLines={1}>{info.familyName}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                    <Ionicons name="people" size={12} color="#aaa" />
                    <Text style={s.famSub}> {info.familyMembers || 1}</Text>
                    <Ionicons name="flame-outline" size={12} color="#aaa" style={{ marginLeft: 8 }} />
                    <Text style={s.famSub}> {fmtPoints(info.familyPoints)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.mainBtns}>
            <TouchableOpacity style={[s.profileBtn, isMe && { flex: 1 }]} onPress={onProfile}>
              <Text style={s.profileTxt}>Profile</Text>
            </TouchableOpacity>
            {!isMe && (
              <TouchableOpacity
                disabled={followBusy}
                style={[s.followBtn, following && { backgroundColor: "#3a3a3a" }, followBusy && { opacity: 0.6 }]}
                onPress={onFollow}
              >
                <Text style={[s.followTxt, following && { color: "#fff" }]}>
                  {following ? "Following" : followBack ? "Follow Back" : "Follow"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
      </View>
    </ModalComponent>
  );
}

// chhota chip button - extra actions ke liye (Report, Mute, Remove ...)
export const SheetChip = ({ label, onPress, color = "#374151", textColor = "#fff", outline, icon, disabled }) => (
  <TouchableOpacity
    disabled={disabled}
    onPress={onPress}
    style={[s.chip, outline ? { backgroundColor: "transparent", borderWidth: 1, borderColor: color } : { backgroundColor: color }, disabled && { opacity: 0.6 }]}
  >
    {!!icon && <Ionicons name={icon} size={13} color={textColor} style={{ marginRight: 4 }} />}
    <Text numberOfLines={1} style={[s.chipTxt, { color: textColor }]}>{label}</Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#141414", borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 16, paddingTop: 22, alignItems: "center" },
  topRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  side: { flex: 1, justifyContent: "center" },
  avaWrap: { width: 100, height: 100, justifyContent: "center", alignItems: "center" },
  ava: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: "#fff", backgroundColor: "#2a2b38" },
  nameRow: { flexDirection: "row", alignItems: "center", marginTop: 10, flexWrap: "wrap", justifyContent: "center" },
  name: { color: "#fff", fontSize: 20, fontWeight: "800", maxWidth: 220 },
  stats: { flexDirection: "row", width: "100%", marginTop: 16 },
  stat: { flex: 1, alignItems: "center" },
  statN: { color: "#fff", fontSize: 20, fontWeight: "800" },
  statL: { color: "#cfcfcf", fontSize: 15, marginTop: 4 },
  cards: { flexDirection: "row", width: "100%", marginTop: 18 },
  card: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#2b2b2b", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 56 },
  lvPill: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  lvTxt: { fontSize: 14, fontWeight: "800", marginLeft: 3 },
  lvMore: { color: "#fff", fontSize: 16, marginLeft: "auto" },
  famLogo: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#222" },
  famName: { color: "#fff", fontSize: 15, fontWeight: "800" },
  famSub: { color: "#ddd", fontSize: 12, fontWeight: "700" },
  mainBtns: { flexDirection: "row", width: "100%", marginTop: 14 },
  profileBtn: { flex: 1, backgroundColor: "#2b2b2b", borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  profileTxt: { color: "#fff", fontSize: 18, fontWeight: "800" },
  followBtn: { flex: 2, marginLeft: 10, backgroundColor: YELLOW, borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  followTxt: { color: "#000", fontSize: 18, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: "100%", marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 3, maxWidth: "100%" },
  chipTxt: { fontWeight: "800", fontSize: 11 },
});
