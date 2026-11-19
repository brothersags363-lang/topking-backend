// components/live/GiftSheet.js
// Screenshot jaisa "Tiki" style gift popup (dark sheet, level bar, user row, 4x2 grid,
// qty pill [1 9 99 199 999], Recharge + Send button).
//
// Props (purane GiftSheet jaise hi + kuch optional):
//   stars, giftUsers, selectedGiftUser, onSelectUser, onSendGift   -> same as before
//   hostId            : jis uid ko "Host" dikhana hai (optional)
//   totalSpent, walletLevel, onUpgrade   -> top level bar (wallets/{uid}.totalSpent + .level).
//                                           Level/progress/"+N stars to upgrade" khud calculate hota hai.
//                                           onUpgrade na do to "Upgrade >" onRecharge par jata hai.
//   onRecharge        : Recharge > dabane par
//   sendWithQty       : true = onSendGift(item, qty) ek hi baar (MultiGuestRoom); false = qty baar loop
//   closeOnSend       : Send ke baad sheet band
//   showAll           : "ALL" chip dikhana hai ya nahi (default true)
//   fallbackAvatar    : avatar na ho to default image url
//
// ref.open() / ref.close() / ref.setPending(n)  -> pehle jaise.

import React, {
  memo, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, Animated, Image, StyleSheet,
  Dimensions, Platform, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gifts } from '../../assets/giftsData';
import LevelBar from './LevelBar';

const { width } = Dimensions.get('window');

const BG = '#1b1b1d';
const YELLOW = '#F2D32B';
const SEND_YELLOW = '#E6D12A';
const RECHARGE = '#D5DC2E';
const GREY = '#8D8D92';
const SHEET_PAD = 12;
const PAGE_W = width - SHEET_PAD * 2;
const CELL_W = PAGE_W / 4;
const PER_PAGE = 8;
const QTY = [1, 9, 99, 199, 999];
const SHEET_OFFSET = 400;

const PAGES = (() => {
  const p = [];
  for (let i = 0; i < gifts.length; i += PER_PAGE) {
    p.push({ key: 'p' + i, items: gifts.slice(i, i + PER_PAGE) });
  }
  return p;
})();

const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
};

// ---------- pending spend store (balance turant kam dikhe) ----------
const pendingStore = {
  v: 0,
  subs: new Set(),
  set(n) { pendingStore.v = n; pendingStore.subs.forEach((f) => f(n)); },
};
const Balance = memo(({ stars }) => {
  const [pending, setPending] = useState(pendingStore.v);
  useEffect(() => {
    setPending(pendingStore.v);
    pendingStore.subs.add(setPending);
    return () => { pendingStore.subs.delete(setPending); };
  }, []);
  return <Text style={s.coinTxt}>{fmt(Math.max(0, stars - pending))}</Text>;
});

// ---------- gift cell ----------
const GiftCell = memo(({ item, selected, onPick }) => (
  <TouchableOpacity
    activeOpacity={0.7}
    delayPressIn={0}
    onPress={() => onPick(item)}
    style={[s.cell, selected && s.cellOn]}
  >
    <Image source={item.icon} style={s.cellImg} resizeMode="contain" fadeDuration={0} />
    <Text style={s.cellName} numberOfLines={1}>{item.name}</Text>
    <View style={s.priceRow}>
      <Ionicons name="star" size={9} color={GREY} />
      <Text style={s.priceTxt}>{item.price}</Text>
    </View>
  </TouchableOpacity>
));

const GiftPage = memo(({ page, selectedId, onPick }) => (
  <View style={{ width: PAGE_W, flexDirection: 'row', flexWrap: 'wrap' }}>
    {page.items.map((it) => (
      <GiftCell key={it.id} item={it} selected={String(it.id) === String(selectedId)} onPick={onPick} />
    ))}
  </View>
));

// ---------- user avatar (rounded square + number badge) ----------
const UserChip = memo(({ label, uri, selected, isHost, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.userWrap}>
    <View style={[s.userBox, selected && s.userBoxOn]}>
      <ExpoImage source={{ uri }} style={s.userImg} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      {isHost ? (
        <View style={s.hostTag}><Text style={s.hostTxt}>Host</Text></View>
      ) : (
        <View style={s.numBadge}><Text style={s.numTxt}>{label}</Text></View>
      )}
    </View>
  </TouchableOpacity>
));

const AllChip = memo(({ selected, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.userWrap}>
    <View style={[s.userBox, s.allBox, selected && s.userBoxOn]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>ALL</Text>
    </View>
  </TouchableOpacity>
));

const GiftSheet = memo(
  forwardRef(function GiftSheet(
    {
      stars = 0, giftUsers = [], selectedGiftUser, onSelectUser, onSendGift,
      hostId, totalSpent = 0, walletLevel, onUpgrade,
      onRecharge, showAll = true, fallbackAvatar, sendWithQty = false, closeOnSend = false,
    },
    ref
  ) {
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const [pageIdx, setPageIdx] = useState(0);
    const [picked, setPicked] = useState(null);   // selected gift item
    const [qty, setQty] = useState(1);
    const anim = useRef(new Animated.Value(SHEET_OFFSET)).current;
    const fade = useRef(new Animated.Value(0)).current;
    const closing = useRef(false);
    const started = useRef(false);

    const open = useCallback(() => {
      closing.current = false;
      anim.setValue(SHEET_OFFSET);
      fade.setValue(0);
      setPageIdx(0);
      setVisible(true);
    }, [anim, fade]);

    const close = useCallback(() => {
      if (closing.current) return;
      closing.current = true;
      Animated.parallel([
        Animated.timing(anim, { toValue: SHEET_OFFSET, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start(() => { closing.current = false; setVisible(false); });
    }, [anim, fade]);

    useImperativeHandle(ref, () => ({ open, close, setPending: pendingStore.set }), [open, close]);

    const startAnim = useCallback(() => {
      if (started.current) return;
      started.current = true;
      Animated.parallel([
        Animated.spring(anim, { toValue: 0, damping: 24, stiffness: 300, mass: 0.7, overshootClamping: true, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }, [anim, fade]);

    useEffect(() => {
      started.current = false;
      if (!visible) return undefined;
      const t = setTimeout(startAnim, 220);
      return () => clearTimeout(t);
    }, [visible, startAnim]);

    const onPageEnd = useCallback((e) => {
      const i = Math.max(0, Math.min(PAGES.length - 1, Math.round(e.nativeEvent.contentOffset.x / PAGE_W)));
      setPageIdx((p) => (p === i ? p : i));
    }, []);

    const onPick = useCallback((it) => setPicked(it), []);

    const send = useCallback(() => {
      if (!picked || !onSendGift) return;
      if (sendWithQty) {
        // ek hi call, qty ke saath (MultiGuestRoom jaisa)
        const r = onSendGift(picked, qty);
        if (r !== false && closeOnSend) close();
        return;
      }
      // qty baar bhejo -> combo x1, x2 ... apne aap badhta hai
      for (let i = 0; i < qty; i++) {
        if (onSendGift(picked) === false) break;   // error/alert aaya -> ruk jao
      }
    }, [picked, qty, onSendGift, sendWithQty, closeOnSend, close]);

    const renderPage = useCallback(
      ({ item }) => <GiftPage page={item} selectedId={picked && picked.id} onPick={onPick} />,
      [picked, onPick]
    );
    const getItemLayout = useCallback((_, i) => ({ length: PAGE_W, offset: PAGE_W * i, index: i }), []);

    // Host sabse pehle, baaki seat order me 1,2,3...
    const ordered = useMemo(() => {
      const host = giftUsers.filter((u) => u.uid === hostId);
      const rest = giftUsers.filter((u) => u.uid !== hostId);
      return [...host, ...rest];
    }, [giftUsers, hostId]);

    let n = 0;

    return (
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent
        hardwareAccelerated onShow={startAnim} onRequestClose={close}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)', opacity: fade }]} />
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />

          <Animated.View
            renderToHardwareTextureAndroid
            style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 8) + 2, transform: [{ translateY: anim }] }]}
          >
            {/* ===== level bar (smooth animated, gift spam par turant badhta hai) ===== */}
            <LevelBar
              totalSpent={totalSpent}
              walletLevel={walletLevel}
              pendingStore={pendingStore}
              onUpgrade={onUpgrade || onRecharge}
            />

            {/* ===== users ===== */}
            <View style={s.usersRow}>
              {showAll && giftUsers.length > 1 && (
                <AllChip selected={selectedGiftUser === 'ALL'}
                  onPress={() => onSelectUser && onSelectUser(selectedGiftUser === 'ALL' ? null : 'ALL')} />
              )}
              {ordered.map((u) => {
                const isHost = u.uid === hostId;
                if (!isHost) n += 1;
                return (
                  <UserChip
                    key={u.uid}
                    label={n}
                    isHost={isHost}
                    uri={u.img || fallbackAvatar}
                    selected={selectedGiftUser === u.uid || selectedGiftUser === 'ALL'}
                    onPress={() => onSelectUser && onSelectUser(u.uid)}
                  />
                );
              })}
            </View>

            {/* ===== gift grid ===== */}
            <FlatList
              data={PAGES}
              extraData={picked && picked.id}
              keyExtractor={(p) => p.key}
              renderItem={renderPage}
              horizontal
              snapToInterval={PAGE_W}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              getItemLayout={getItemLayout}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={5}
              removeClippedSubviews={false}
              bounces={Platform.OS === 'ios'}
              overScrollMode="never"
              nestedScrollEnabled
              onMomentumScrollEnd={onPageEnd}
              style={{ flexGrow: 0 }}
            />

            {PAGES.length > 1 && (
              <View style={s.dots}>
                {PAGES.map((p, i) => (
                  <View key={p.key} style={[s.dot, i === pageIdx && s.dotOn]} />
                ))}
              </View>
            )}

            {/* ===== bottom bar ===== */}
            <View style={s.bottom}>
              <View style={{ minWidth: 54 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={s.coin}><Text style={s.coinS}>$</Text></View>
                  <Balance stars={stars} />
                </View>
                <TouchableOpacity onPress={onRecharge} activeOpacity={0.7} style={{ marginTop: 2 }}>
                  <Text style={s.recharge}>Recharge {'>'}</Text>
                </TouchableOpacity>
              </View>

              <View style={s.sendWrap}>
                <View style={s.qtyPill}>
                  {QTY.map((q) => (
                    <TouchableOpacity key={q} onPress={() => setQty(q)} activeOpacity={0.7}
                      style={[s.qtyItem, qty === q && s.qtyItemOn]}>
                      <Text style={[s.qtyTxt, qty === q && s.qtyTxtOn]}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={send} activeOpacity={0.8}
                  style={[s.sendBtn, !picked && { opacity: 0.55 }]}>
                  <Text style={s.sendTxt}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  }),
  (a, b) =>
    a.stars === b.stars &&
    a.selectedGiftUser === b.selectedGiftUser &&
    a.onSelectUser === b.onSelectUser &&
    a.onSendGift === b.onSendGift &&
    a.hostId === b.hostId &&
    a.totalSpent === b.totalSpent &&
    a.walletLevel === b.walletLevel &&
    a.onUpgrade === b.onUpgrade &&
    a.onRecharge === b.onRecharge &&
    (a.giftUsers === b.giftUsers ||
      a.giftUsers.map((u) => u.uid + '|' + u.img + '|' + u.name).join(',') ===
        b.giftUsers.map((u) => u.uid + '|' + u.img + '|' + u.name).join(','))
);

export default GiftSheet;

const s = StyleSheet.create({
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingHorizontal: SHEET_PAD,
    overflow: 'hidden',
  },


  // users
  usersRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  userWrap: { marginRight: 8 },
  userBox: {
    width: 38, height: 38, borderRadius: 11, borderWidth: 2, borderColor: 'transparent',
    overflow: 'hidden', backgroundColor: '#2a2a2e',
  },
  userBoxOn: { borderColor: YELLOW },
  userImg: { width: '100%', height: '100%' },
  allBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2f2f34' },
  hostTag: {
    position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center',
    backgroundColor: YELLOW, paddingVertical: 1,
  },
  hostTxt: { color: '#000', fontSize: 8, fontWeight: '800' },
  numBadge: {
    position: 'absolute', bottom: 0, left: 0, minWidth: 14, height: 14, borderTopRightRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  numTxt: { color: '#fff', fontSize: 8, fontWeight: '700' },

  // grid
  cell: { width: CELL_W - 6, marginHorizontal: 3, marginBottom: 2, paddingVertical: 5, borderRadius: 12, alignItems: 'center' },
  cellOn: { backgroundColor: 'rgba(255,255,255,0.09)' },
  cellImg: { width: 40, height: 40 },
  cellName: { color: '#fff', fontSize: 10, marginTop: 3, fontWeight: '500' },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  priceTxt: { color: GREY, fontSize: 10, marginLeft: 3 },

  // dots
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, marginHorizontal: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotOn: { backgroundColor: '#fff' },

  // bottom
  bottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  coin: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#C99A1E',
    alignItems: 'center', justifyContent: 'center',
  },
  coinS: { color: '#fff3c0', fontSize: 9, fontWeight: '800' },
  coinTxt: { color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 5 },
  recharge: { color: RECHARGE, fontSize: 12, fontWeight: '600' },

  sendWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  qtyPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 36, borderRadius: 18, backgroundColor: '#2c2c30', paddingHorizontal: 4, marginRight: 6,
  },
  qtyItem: { minWidth: 26, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  qtyItemOn: { backgroundColor: '#fff' },
  qtyTxt: { color: '#d8d8dc', fontSize: 12, fontWeight: '600' },
  qtyTxtOn: { color: '#000', fontWeight: '800' },
  sendBtn: {
    height: 36, minWidth: 74, paddingHorizontal: 16, borderRadius: 18,
    backgroundColor: SEND_YELLOW, alignItems: 'center', justifyContent: 'center',
  },
  sendTxt: { color: '#1a1a1a', fontSize: 14, fontWeight: '800' },
});
