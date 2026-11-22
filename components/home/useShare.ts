import { useRef, useState, useEffect } from 'react';
import { Platform, Share, Linking, Alert, AppState } from 'react-native';
import { rewardShare } from '../../utils/shareReward';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../app/firebaseConfig';
import { videoLink } from '../../utils/shareLinks';


export function useShare({ setVideos, router }: any) {
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [selectedShareVideo, setSelectedShareVideo] = useState<any>(null);

  // ---- SHARE: count + star reward (ek hi jagah) ----
  const countShare = (videoId) => {
    setVideos(prev => prev.map(video =>
      video.id === videoId
        ? { ...video, shares: (video.shares || 0) + 1 }
        : video
    ));
    // Star reward pehle, alag se: shares count fail ho to bhi star mile
    try { rewardShare(videoId); } catch (e) {}
    updateDoc(doc(db, 'all_videos', videoId), { shares: increment(1), engagementScore: increment(10) })
      .catch((e) => { __DEV__ && console.log("Share count error", e); });
  };

  // ---- Star sirf tab jab user sach me share karke wapas aaye ----
  // Android share sheet cancel ho ya app khulte hi "shared" bata deta he, isliye
  // app ke background jaane ka time napte hain: kam se kam 4 sec bahar raha tabhi count.
  const pendingShareRef = useRef(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const p = pendingShareRef.current;
      if (!p) return;
      if (st === 'background' || st === 'inactive') {
        if (!p.leftAt) p.leftAt = Date.now();
      } else if (st === 'active') {
        if (p.leftAt) {
          const away = Date.now() - p.leftAt;
          pendingShareRef.current = null;
          if (away >= 4000) countShare(p.videoId);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const armShare = (videoId) => {
    const p = { videoId, leftAt: null };
    pendingShareRef.current = p;
    // 10 min me wapas na aaye to cancel
    setTimeout(() => { if (pendingShareRef.current === p) pendingShareRef.current = null; }, 10 * 60 * 1000);
  };

  // Phone ka normal share sheet (More / Instagram / fallback)
  const handleShare = async (videoUrl, videoId) => {
    try {
      armShare(videoId);
      const result = await Share.share({
        message: `Check out this amazing video on TopKing 👑\n${videoLink(videoId)}`,
      });
      if (result.action === Share.dismissedAction) {
        pendingShareRef.current = null; // cancel kiya -> koi star nahi
      } else if (Platform.OS === 'ios' && result.action === Share.sharedAction) {
        pendingShareRef.current = null;
        countShare(videoId); // iOS me sahi se pata chalta he
      }
      // Android: AppState wala check upar decide karega
    } catch (e) {
      pendingShareRef.current = null;
      __DEV__ && console.log("Share Error", e);
    }
  };

  // Kisi bhi app me seedha share (WhatsApp, Telegram, Facebook, SMS...)
  // Agar app install nahi ho to phone ka normal share sheet khul jata he
  const shareToApp = async (appKey, videoId) => {
    const link = videoLink(videoId);
    const text = `Check out this amazing video on TopKing 👑\n${link}`;
    const enc = encodeURIComponent(text);
    const encLink = encodeURIComponent(link);
    const urls = {
      whatsapp: `whatsapp://send?text=${enc}`,
      telegram: `tg://msg?text=${enc}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encLink}`,
      messenger: `fb-messenger://share?link=${encLink}`,
      twitter: `twitter://post?message=${enc}`,
      sms: Platform.OS === 'ios' ? `sms:&body=${enc}` : `sms:?body=${enc}`,
    };
    const url = urls[appKey];
    try {
      if (!url) throw new Error('no-url');
      armShare(videoId);          // star abhi nahi, wapas aane par
      await Linking.openURL(url);
    } catch (e) {
      pendingShareRef.current = null;
      // app nahi mila -> system share sheet
      handleShare(null, videoId);
    }
  };

  const copyVideoLink = async (videoId) => {
    const link = videoLink(videoId);
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(link);
      Alert.alert('Link copied', 'Video link copy ho gaya');
    } catch (e) {
      // expo-clipboard install nahi he -> share sheet se link do
      Share.share({ message: link }).catch(() => {});
    }
  };

  const SHARE_APPS = [
    { key: 'friends',   label: 'TopKing\nFriends', icon: 'people',        lib: 'ion', bg: '#FFD700', color: '#000' },
    { key: 'whatsapp',  label: 'WhatsApp',   icon: 'whatsapp',      lib: 'mci', bg: '#25D366', color: '#fff' },
    { key: 'telegram',  label: 'Telegram',   icon: 'telegram',      lib: 'mci', bg: '#229ED9', color: '#fff' },
    { key: 'facebook',  label: 'Facebook',   icon: 'facebook',      lib: 'mci', bg: '#1877F2', color: '#fff' },
    { key: 'messenger', label: 'Messenger',  icon: 'facebook-messenger', lib: 'mci', bg: '#A033FF', color: '#fff' },
    { key: 'instagram', label: 'Instagram',  icon: 'instagram',     lib: 'mci', bg: '#E1306C', color: '#fff' },
    { key: 'twitter',   label: 'X',          icon: 'twitter',       lib: 'mci', bg: '#000',    color: '#fff' },
    { key: 'sms',       label: 'SMS',        icon: 'message-text',  lib: 'mci', bg: '#34C759', color: '#fff' },
    { key: 'more',      label: 'More',       icon: 'ellipsis-horizontal', lib: 'ion', bg: '#333', color: '#fff' },
  ];

  const onSharePick = (appKey) => {
    const v = selectedShareVideo;
    if (!v) return;
    setShowSharePopup(false);
    if (appKey === 'friends') {
      router.push({
        pathname: "../ShareVideo",
        params: {
          videoId: v.id,
          videoUrl: v.videoUrl || v.video,
          thumbnail: v.thumbnail,
        },
      });
    } else if (appKey === 'more' || appKey === 'instagram') {
      // Instagram text-share link support nahi karta -> system sheet (usme Instagram milta he)
      handleShare(v.videoUrl, v.id);
    } else {
      shareToApp(appKey, v.id);
    }
  };

  return { showSharePopup, setShowSharePopup, selectedShareVideo, setSelectedShareVideo, SHARE_APPS, onSharePick, copyVideoLink };
}
