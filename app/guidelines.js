import React, { useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, BackHandler } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AppLogo from "../assets/images/topking-logo.png";

const Y = "#FFE500";

// Each rule: n = number, t = title, p = intro line (optional), l = bullet list, steps = numbered steps, note = highlighted note
const RULES = [
  {
    n: 1, t: "Video Content – Original Only", hero: true,
    p: "Only upload original videos that you created yourself on TopKing.",
    l: [
      "Do not post someone else's video, a screen recording or downloaded content as your own.",
      "Do not use copyrighted music, movie clips or TV content without permission.",
      "Your video must be clear and must not be misleading or fake.",
      "Copied or re-uploaded videos will be removed and action may be taken on your account.",
    ],
    tick: "300+ views = White Tick",
    note: "When your original video reaches 300+ views, you get the white verified tick. See the next point for the Yellow and Blue ticks. A tick stays only while your content is original and you follow the rules. Fake views are not counted.",
  },
  {
    n: 2, t: "Verified Tick – White, Yellow and Blue",
    p: "TopKing has 3 kinds of verified ticks. Each has its own requirements and benefits.",
    ticks: [
      {
        color: "#FFFFFF", name: "White Tick", sub: "Original creator",
        how: [
          "Upload only your own original videos.",
          "You get the white tick as soon as one original video reaches 300+ views.",
          "Copied videos and fake views are not counted.",
        ],
      },
      {
        color: "#FFE600", name: "Yellow Tick", sub: "Verified Creator",
        how: [
          "Open Creator Verification from the Profile menu.",
          "Face verification: submit a selfie and get it approved.",
          "Add a real photo and bio to your profile.",
          "Take the quiz and score 60 or more.",
          "Get 5 videos with 300+ views and 4500+ total views.",
          "Once everything is complete, the TopKing team reviews and approves your Yellow tick.",
        ],
        perks: "Benefits: become a Family Creator, priority reports within 24 hours, more visibility, higher earnings.",
      },
      {
        color: "#1E90FF", name: "Blue Tick", sub: "Premium Creator",
        how: [
          "The Blue tick is approved only by the TopKing team.",
          "You need to already have the Yellow tick and a clean guidelines record.",
          "The team selects top creators itself, so keep making great original content.",
        ],
        perks: "Benefits: full TopKing support, events and creator programs, monthly salary opportunities, premium creator account.",
      },
    ],
    note: "A tick can be removed if you break the rules. Fake views or copied content will not earn a tick.",
  },
  {
    n: 3, t: "About the TopKing App",
    p: "TopKing is a video and live-streaming social app where creators show their talent and connect with fans.",
    l: [
      "Upload short videos, and like, comment and share.",
      "Join friends in Audio Live Rooms and Video Live.",
      "Invite live friends to a PK battle and compete.",
      "Support your favourite creator with stars and gifts.",
      "Give your profile a premium look with level frames, badges and Video Rank.",
      "Stay connected with 1-to-1 chat and stories.",
    ],
  },
  {
    n: 4, t: "How to Get Live Access",
    steps: [
      "Complete your profile: name, photo and bio.",
      "Be at least 18 years old.",
      "Upload your original videos and follow the guidelines.",
      "Your account must have no ban or serious violation.",
      "Once eligible, the Live option opens in the app, or you can go live as a host through an agency.",
    ],
    note: "Live access can be turned off at any time if a rule violation is reported.",
  },
  {
    n: 5, t: "How to Join an Agency",
    steps: [
      "Open Agency or Agency Request from the Profile menu.",
      "Enter the agency ID or invite code, or send a request.",
      "The agency owner or admin approves your request.",
      "Once approved, you become a host of that agency.",
    ],
    l: [
      "Stay in only one agency at a time.",
      "To leave an agency, talk to the agency or an admin first.",
      "Do not pay money or trust false promises to join an agency. TopKing never charges a fee to join.",
      "Both the agency and its hosts must follow these guidelines. If rules are broken, an admin can remove a host or take action against the agency.",
    ],
  },
  { n: 6, t: "Respect and Safety", l: [
    "Abuse, bullying, threats and harassment are not allowed.",
    "Spreading hate based on religion, caste, country, gender or body is prohibited.",
    "Repeatedly messaging someone or forming groups to harass them is prohibited.",
  ]},
  { n: 7, t: "Age and Child Safety", l: [
    "You must be 18+ for Live and withdrawals.",
    "Do not show children in harmful, exploitative or inappropriate content.",
    "Report anything like this immediately. This is a zero tolerance rule.",
  ]},
  { n: 8, t: "Adult, Violent and Dangerous Content", l: [
    "Nudity, sexual or vulgar content is not allowed in videos, lives, profile photos or chats.",
    "Fighting, gore, weapons or content that encourages self-harm is prohibited.",
    "Promoting drugs, gambling or illegal activity is prohibited.",
    "Do not show dangerous stunts or challenges that could get someone hurt.",
  ]},
  { n: 9, t: "Copyright", l: [
    "Use only music, photos and videos that you have the rights to.",
    "Do not misuse the name or logo of any brand, creator or celebrity.",
    "Content will be removed after a copyright complaint.",
  ]},
  { n: 10, t: "Stars, Gifts, Wallet and Withdrawals", l: [
    "Buy stars only through the app's official methods, never from a third party.",
    "Fake gifting, abusing glitches or bugs, and hacking attempts lead to a permanent ban and the balance may be seized.",
    "Give your own correct details for withdrawals. Do not use someone else's account or false details.",
    "Asking for money or personal gain in return for gifts, and cheating viewers, is prohibited.",
    "Never share your password, OTP or wallet details with anyone.",
  ]},
  { n: 11, t: "Live Room Rules", l: [
    "The host is responsible for their room. Do not allow abuse, vulgar talk or fights in the room.",
    "Play PK battles fairly. Winning with fake votes or fake gifts is prohibited.",
    "Do not pressure viewers to send gifts.",
    "Do not record and spread someone's screen or voice without their permission.",
  ]},
  { n: 12, t: "Fake Accounts, Spam and Impersonation", l: [
    "Do not create a fake profile using someone else's name or photo.",
    "Fake follows, likes, views and bots are prohibited. Such views will not count towards a verified tick.",
    "Do not send spam links, scams or unauthorised ads.",
  ]},
  { n: 13, t: "Privacy", l: [
    "Do not share anyone's personal information, number, address or photos without permission.",
    "Making private chats public or blackmailing someone is prohibited.",
    "Do not reveal your own sensitive information on live.",
  ]},
  { n: 14, t: "How to Report",
    p: "If you see a video, user, chat or live that breaks the rules, tap it and choose Report. Every report is reviewed. Repeatedly filing false reports is also against the rules." },
  { n: 15, t: "Action for Breaking Rules", l: [
    "First minor mistake: warning or content removal.",
    "Repeated mistakes: restriction on live or comments, and loss of the verified tick.",
    "Serious violations: temporary or permanent account ban.",
    "If a host breaks the rules, action can also be taken against their agency.",
  ], note: "If you have questions about an action, you can appeal through Feedback." },
  { n: 16, t: "Changes to the Guidelines",
    p: "TopKing may update these guidelines when needed. Continuing to use the app means you accept the new rules." },
];

RULES.forEach((r, i) => { r.n = i + 1; });

const Rule = ({ r }) => {
  const dark = r.hero;
  const txt = dark ? "#2a2800" : "#bdbdbd";
  return (
    <View style={[s.rule, r.hero && s.hero]}>
      <Text style={[s.num, dark && { color: "#111" }]}>{r.n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.h, dark && { color: "#111" }]}>{r.t}</Text>
        {!!r.p && <Text style={[s.p, { color: txt }]}>{r.p}</Text>}
        {r.steps && r.steps.map((x, i) => (
          <View key={i} style={s.stepRow}>
            <View style={s.stepDot}><Text style={s.stepNum}>{i + 1}</Text></View>
            <Text style={[s.p, { flex: 1, color: txt, marginBottom: 0 }]}>{x}</Text>
          </View>
        ))}
        {r.l && r.l.map((x, i) => (
          <View key={i} style={s.bulletRow}>
            <View style={[s.bullet, dark && { backgroundColor: "#111" }]} />
            <Text style={[s.p, { flex: 1, color: txt, marginBottom: 0 }]}>{x}</Text>
          </View>
        ))}
        {r.ticks && r.ticks.map((t) => (
          <View key={t.name} style={s.tickCard}>
            <View style={s.tickHead}>
              <Ionicons name="checkmark-circle" size={30} color={t.color} />
              <View style={{ marginLeft: 10 }}>
                <Text style={s.tickName}>{t.name}</Text>
                <Text style={s.tickSub}>{t.sub}</Text>
              </View>
            </View>
            {t.how.map((x, i) => (
              <View key={i} style={s.stepRow}>
                <View style={[s.stepDot, { backgroundColor: t.color }]}><Text style={[s.stepNum, t.color === "#1E90FF" && { color: "#fff" }]}>{i + 1}</Text></View>
                <Text style={[s.p, { flex: 1, color: txt, marginBottom: 0 }]}>{x}</Text>
              </View>
            ))}
            {!!t.perks && <Text style={s.perks}>{t.perks}</Text>}
          </View>
        ))}
        {!!r.tick && (
          <View style={s.tickPill}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={s.tickText}>{r.tick}</Text>
          </View>
        )}
        {!!r.note && (
          <View style={[s.note, dark && { backgroundColor: "rgba(0,0,0,0.12)", borderLeftColor: "#111" }]}>
            <Text style={[s.p, { color: dark ? "#111" : "#eee", marginBottom: 0 }]}>{r.note}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default function Guidelines() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profile");
  };

  // Phone back button: own handler so the profile tab handler does not take over
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const hero = RULES[0];
  const rest = RULES.slice(1);

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Community Guidelines</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 + insets.bottom }}
      >
        <View style={s.top}>
          <Image source={AppLogo} style={s.logo} resizeMode="cover" />
          <Text style={s.brand}>TopKing Community Guidelines</Text>
          <Text style={s.sub}>
            TopKing is a safe, original and respectful community. Please read and follow these rules before using the app.
          </Text>
          <View style={s.badge}><Text style={s.badgeText}>Premium Community</Text></View>
        </View>

        <Rule r={hero} />
        {rest.map((r) => <Rule key={r.n} r={r} />)}

        <Text style={s.footBrand}>TopKing</Text>
        <Text style={s.foot}>Be original. Show respect. Stay on top.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0e0e0e" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", marginLeft: 6 },
  top: { alignItems: "center", paddingVertical: 26, borderBottomWidth: 1, borderBottomColor: "#2c2a1c" },
  logo: { width: 104, height: 104, borderRadius: 26, borderWidth: 2, borderColor: Y },
  brand: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 16, textAlign: "center" },
  sub: { color: "#a8a592", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 6, maxWidth: 320 },
  badge: { backgroundColor: Y, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5, marginTop: 14 },
  badgeText: { color: "#111", fontSize: 12, fontWeight: "800" },
  rule: { flexDirection: "row", paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: "#2c2a1c" },
  hero: { backgroundColor: Y, borderRadius: 20, padding: 20, marginTop: 22, borderBottomWidth: 0 },
  num: { color: Y, fontSize: 28, fontWeight: "900", width: 46 },
  h: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  p: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: Y, marginTop: 8, marginRight: 10 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: Y, alignItems: "center", justifyContent: "center", marginRight: 10, marginTop: 1 },
  stepNum: { color: "#111", fontSize: 13, fontWeight: "800" },
  tickPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#111", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 },
  tickText: { color: Y, fontSize: 14, fontWeight: "800", marginLeft: 8 },
  tickCard: { backgroundColor: "#171717", borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#2c2a1c" },
  tickHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  tickName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  tickSub: { color: "#a8a592", fontSize: 12 },
  perks: { color: "#eee", fontSize: 13, lineHeight: 20, marginTop: 10, fontWeight: "600" },
  note: { backgroundColor: "#171717", borderLeftWidth: 3, borderLeftColor: Y, borderRadius: 10, padding: 12, marginTop: 12 },
  footBrand: { color: Y, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 30 },
  foot: { color: "#a8a592", fontSize: 13, textAlign: "center", marginTop: 4 },
});
