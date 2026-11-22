import { View, TouchableOpacity, Pressable, StyleSheet, FlatList, Image, ActivityIndicator, TextInput, Keyboard, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarFrame } from '../FramedAvatar';
import { auth, height, width } from './feedShared';
import { commentKeyExtractor, CommentsEmpty } from './CommentRow';
import { styles } from './feedStyles';

export function CommentsSheet({ closeComments, commentAnim, commentBackdrop, commentInputRef, commentListRef, commentPan, commentTextRef, comments, commentsLoading, currentUserData, keyboardHeight, loadMoreComments, onCommentChange, postComment, renderComment, replyingTo }: any) {
  return (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  {/* Fading backdrop */}
  <Animated.View
    pointerEvents="none"
    style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: commentBackdrop }]}
  />

  {/* Background press */}
  <Pressable
    style={StyleSheet.absoluteFill}

   onPress={closeComments}
  />

  {/* Bottom Sheet */}
  <Animated.View
style={[
styles.commentsSheet,
{
transform:[
{
translateY:commentAnim
}
]
}
]}
>

    {/* SIMPLE: sirf chhota handle -- caption / username / photo hata diya */}
    <View style={styles.commentHandleArea} {...commentPan.panHandlers}>
      <View style={styles.commentHandle} pointerEvents="none" />
    </View>

{commentsLoading ? (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginTop: 20 }}>
    <ActivityIndicator size="large" color="#FFD700" />
  </View>
) : (
  <FlatList
    ref={commentListRef}
    data={comments}
    renderItem={renderComment}
    keyExtractor={commentKeyExtractor}
    style={{ flex: 1, marginTop: 6 }}
    contentContainerStyle={{ paddingBottom: 90 }}
    showsVerticalScrollIndicator={false}
    keyboardDismissMode="interactive"
    keyboardShouldPersistTaps="handled"
    removeClippedSubviews={false}
    initialNumToRender={10}
    maxToRenderPerBatch={8}
    windowSize={8}
    onEndReached={loadMoreComments}
    onEndReachedThreshold={0.5}
    ListEmptyComponent={CommentsEmpty}
  />
)}

    <Animated.View
style={[
styles.commentInputContainer,
{

transform:[
{
translateY:Animated.multiply(keyboardHeight,-1)
}
]


}
]}
>






      <View style={{ width: 35, height: 35, marginRight: 10 }}>
        <Image
          source={{ uri: currentUserData.photo }}
          style={[styles.commentProfile, { marginRight: 0 }]}
        />
        <AvatarFrame uid={auth.currentUser?.uid} size={35} animated={false} />
      </View>

    <TextInput
    ref={commentInputRef}
  onChangeText={onCommentChange}
  placeholder={replyingTo ? 'Add a reply...' : 'Add a comment...'}
  placeholderTextColor="#999"
  style={styles.commentInput}

  // Keyboard ke send button ko enable karega
  returnKeyType="send"

  // Keyboard khula rahega
  blurOnSubmit={false}

  // Keyboard ka send button dabane par
  onSubmitEditing={() => {
    if (commentTextRef.current.trim()) {
      postComment();
    }
  }}
/>

      <TouchableOpacity onPress={postComment}>
        <Ionicons
          name="send"
          size={24}
          color="#FFD700"
        />
      </TouchableOpacity>

</Animated.View>


    </Animated.View>

  

</View>




  );
}
