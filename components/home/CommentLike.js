import { memo, useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../app/firebaseConfig';

// Comment par like: all_videos/{video}/comments/{comment}/likes/{uid} + comment.likesCount
export const CommentLike = memo(function CommentLike({ videoId, commentId, count }) {
  const uid = auth.currentUser?.uid;
  const [liked, setLiked] = useState(false);
  const [delta, setDelta] = useState(0);
  const busy = useRef(false);

  // Mera like pehle se hai ya nahi (ek baar, sirf is comment ke liye)
  useEffect(() => {
    if (!uid || !videoId || !commentId) return;
    let alive = true;
    getDoc(doc(db, 'all_videos', videoId, 'comments', commentId, 'likes', uid))
      .then((s) => alive && setLiked(s.exists()))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, videoId, commentId]);

  // Server ka count aa gaya => local +/-1 hata do
  useEffect(() => {
    setDelta(0);
  }, [count]);

  const toggle = async () => {
    if (!uid || !videoId || !commentId || busy.current) return;
    busy.current = true;
    const next = !liked;
    const d = next ? 1 : -1;
    setLiked(next);
    setDelta((x) => x + d);
    try {
      const likeRef = doc(db, 'all_videos', videoId, 'comments', commentId, 'likes', uid);
      const batch = writeBatch(db);
      if (next) batch.set(likeRef, { userId: uid, createdAt: serverTimestamp() });
      else batch.delete(likeRef);
      batch.update(doc(db, 'all_videos', videoId, 'comments', commentId), {
        likesCount: increment(d),
      });
      await batch.commit();
    } catch (e) {
      setLiked(!next);
      setDelta((x) => x - d);
    } finally {
      busy.current = false;
    }
  };

  const shown = Math.max(0, (Number(count) || 0) + delta);

  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={st.box}
    >
      <Ionicons
        name={liked ? 'heart' : 'heart-outline'}
        size={20}
        color={liked ? '#ff2d55' : '#bbb'}
      />
      {shown > 0 ? <Text style={st.num}>{shown}</Text> : null}
    </TouchableOpacity>
  );
});

const st = StyleSheet.create({
  box: { alignItems: 'center', paddingLeft: 10, paddingTop: 2, minWidth: 34 },
  num: { color: '#999', fontSize: 11, marginTop: 2 },
});
