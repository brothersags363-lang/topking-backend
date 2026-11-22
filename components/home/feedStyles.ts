import { StyleSheet, Platform, StatusBar } from 'react-native';
import { height, width } from './feedShared';

export const STATUS_BAR_H =
  Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 50;

export const styles = StyleSheet.create({
  statusBarBlack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STATUS_BAR_H,
    backgroundColor: '#000000',
    zIndex: 6,
    elevation: 6,
  },
  uploadBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 40,
    left: 14,
    zIndex: 1000,
    elevation: 20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 74,
  },
  uploadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  uploadBadgeErrorText: {
    color: '#ff5e5e',
    fontSize: 12,
    fontWeight: '700',
  },
  uploadBadgeTrack: {
    width: 60,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  uploadBadgeFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FF5E00',
  },

  loadingBox: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullScreenOverlay: { flex: 1, backgroundColor: '#000' },
  video: {
  ...StyleSheet.absoluteFillObject,
},
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },

  bottomLeft:  {
  position: 'absolute',

  left: 12,

  bottom: 120,      // niche se kitna upar

  width: width * 0.7,

  zIndex: 999,
},


  userName: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  followPill: { marginLeft: 10, paddingHorizontal: 12, height: 26, borderRadius: 7, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  followPillText: { color: '#000', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  caption: { color: '#ffffff', fontSize: 14, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 1 },




musicRow:{
flexDirection:"row",
alignItems:"center",
marginTop:10,
},

musicDiscOuter:{
marginRight:10,
},

vinylDisc:{
width:37,
height:37,
borderRadius:19,
backgroundColor:"#111",
justifyContent:"center",
alignItems:"center",

borderWidth:2,
borderColor:"#444",

shadowColor:"#000",
shadowOpacity:0.6,
shadowRadius:8,
shadowOffset:{
width:0,
height:4,
},

elevation:8,
},

musicCenterImage:{
width:26,
height:26,
borderRadius:13,
},

musicDot:{
position:"absolute",
width:2,
height:2,
borderRadius:3,
backgroundColor:"#fff",
},


  bufferSpinner: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', zIndex: 5 },

  rightIcons:  {
  position: 'absolute',

  right: 1,

  bottom: 110,   // video ke niche se kitna upar

  alignItems: 'center',

  zIndex: 999,
},


  iconBox: { marginBottom: 14, alignItems: 'center' },
  iconShadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  iconText: { color: '#ffffff', fontWeight: '700', marginTop: 2, fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  profileImage: { width: 50, height: 50, borderRadius: 18, borderWidth: 1.5, borderColor: '#ffffff' },
  profileImageLive: { borderWidth: 3, borderColor: '#FFD700' },
  profilePlus: { position: 'absolute', bottom: -11, alignSelf: 'center', zIndex: 40, elevation: 40 },
  profilePlusBtn: { width: 23, height: 18, borderRadius: 5, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  profilePlusH: { position: 'absolute', width: 10, height: 2.4, borderRadius: 2, backgroundColor: '#000' },
  profilePlusV: { position: 'absolute', width: 2.5, height: 11, borderRadius: 2, backgroundColor: '#000' },
  liveTagFeed: {
    zIndex: 30,        // frame (zIndex 5) ke UPAR dikhe
    elevation: 30,     // Android me bhi upar
    position: 'absolute',
    top: -7,
    alignSelf: 'center',
    backgroundColor: '#FF2D55',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#fff',
  },
  liveTagFeedText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },

 plusIconSmall:{

position:'absolute',

bottom:-8,

alignSelf:'center',

backgroundColor:'#FFD700',

width:27,

height:20,

borderRadius:8,

justifyContent:'center',

alignItems:'center',

zIndex:9999,

},

  starImage: { width: 65, height: 65, resizeMode: 'contain' },
  starUpText: { color: '#fffef7', fontSize: 13, fontWeight: 'bold', marginTop: 0, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  gridRoot: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000', zIndex: 5 },
  gridMeta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  gridAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 6, backgroundColor: '#333' },
  gridName: { color: '#fff', fontSize: 12, fontWeight: '700' },
  gridTime: { color: 'rgba(255,255,255,0.75)', fontSize: 10 },
  gridCaption: { position: 'absolute', left: 8, bottom: 6, right: 8, color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  gridEmpty: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center', marginTop: 120, paddingHorizontal: 40 },
  liveBubble: { alignItems: 'center', marginRight: 12, width: 70 },
  liveRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: '#FFEB00', justifyContent: 'center', alignItems: 'center' },
  liveImg: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#333' },
  liveBadge: { position: 'absolute', bottom: -6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  liveBadgeText: { color: '#000', fontSize: 9, fontWeight: '800' },
  liveName: { color: '#fff', fontSize: 11, marginTop: 8 },
  topBar: { position: 'absolute', top: Platform.OS === 'ios' ? 62 : 42, left: 0, right: 0, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  topLiveBtn: { position: 'absolute', left: 16, top: 6, width: 30, height: 28, justifyContent: 'center', alignItems: 'center' },
  topTabsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  topTabBtn: { marginHorizontal: 14, alignItems: 'center' },
  topTabText: { color: 'rgba(255,255,255,0.75)', fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  topTabTextActive: { color: '#ffffff' },
  topTabUnderline: { width: 26, height: 3, backgroundColor: '#FFEB00', marginTop: 3, borderRadius: 2 },
  topTabsContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, width: width, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  tabText: { color: '#ffffff', fontSize: 18, marginHorizontal: 15, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  activeUnderline: { width: 30, height: 3, backgroundColor: '#ffffff', alignSelf: 'center', marginTop: 2, borderRadius: 2 },
  separator: { width: 1, height: 15, backgroundColor: 'rgba(255,255,255,0.4)' },
  
  // Custom Styles matched with standard messages layout structure
  bottomSection: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#000', borderTopWidth: 0.5, borderTopColor: '#222' },
  bottomNavContainer: { width: '100%', height: 60, justifyContent: 'center', marginBottom: Platform.OS === 'ios' ? 10 : 20 },
  bottomNav: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: '#FFD400', width: 48, height: 34, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },
  // Seek bar (menu se chipka peela line)
  seekWrap: { width: '100%', height: 10, justifyContent: 'flex-start' },
  seekTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  seekTrackActive: { height: 6 },
  seekFill: { height: '100%', backgroundColor: '#f1c40f' },
  seekThumb: { position: 'absolute', top: -4, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: '#f1c40f' },
  seekTimeBox: { position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'flex-end', paddingRight: 10, paddingBottom: 4 },
  seekTimeSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  seekTimeBig: { color: '#fff', fontSize: 20, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, paddingBottom: 6 },
  bottomFill: { backgroundColor: '#000', width: '100%', height: Platform.OS === 'ios' ? 35 : 15 },

commentsSheet:{

width:'100%',

height:height*0.70,

backgroundColor:'#000',

borderTopLeftRadius:25,

borderTopRightRadius:25,
overflow:'hidden',
},
commentHandleArea: {
  width: '100%',
  paddingTop: 2,
  paddingBottom: 12,
},
commentHandle: {
  alignSelf: 'center',
  width: 40,
  height: 4,
  borderRadius: 2,
  backgroundColor: '#444',
  marginTop: 10,
},
commentInputContainer: {
  position: 'absolute',
  bottom: 45,
  left: 10,
  right: 10,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#111',
  borderRadius: 30,
  paddingHorizontal: 10,
  paddingVertical: 8,
},

commentProfile: {
  width: 35,
  height: 35,
  borderRadius: 18,
  marginRight: 10,
},

commentInput: {
  flex: 1,
  color: '#fff',
  fontSize: 15,
},

heartPopup: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
  transform: [{ scale: 1.2 }],
},

starPopupContainer: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: height,
  backgroundColor: 'rgba(0,0,0,0.4)',
  justifyContent: 'flex-end',
  zIndex: 9999,
},

starPopup: {
  width: '100%',
  height: 340,

  backgroundColor: '#111',

  borderTopLeftRadius: 25,
  borderTopRightRadius: 25,

  paddingTop: 20,
  paddingHorizontal: 20,
},

popupTitle: {
  color: '#fff',
  fontSize: 18,
  fontWeight: 'bold',
  textAlign: 'center',
  marginBottom: 20,
},

starOption: {
  backgroundColor: '#222',
  padding: 15,
  borderRadius: 12,
  marginBottom: 10,
},

starText: {
  color: '#FFD700',
  textAlign: 'center',
  fontWeight: 'bold',
  fontSize: 18,
},

starSubmitBtn: {
  backgroundColor: '#FFD700',
  paddingVertical: 14,
  borderRadius: 30,
  marginTop: 30,
  alignSelf: 'center',
  width: 180,
},

starSubmitText: {
  color: '#000',
  fontWeight: 'bold',
  textAlign: 'center',
},

starRow: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  marginTop: -23,
},

starCard: {
  width: 90,
  height: 100,
  backgroundColor: 'transparent',
  borderRadius: 20,
  justifyContent: 'center',
  alignItems: 'center',
},

activeStar: {
  borderWidth: 3,
  borderColor: '#FFD700',

  shadowColor: '#FFD700',
  shadowOpacity: 1,
  shadowRadius: 15,
  elevation: 15,
},

starNumber: {
  fontSize: 30,
},

starValue: {
  color: '#272725',
  fontWeight: 'bold',
  fontSize: 15,
  marginTop: -45,   // upar layega
},

popupStarImage: {
  width: 90,
  height: 90,
  resizeMode: 'contain',
 marginTop: -15, 

},

myStarBox: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
   top: -10,
  left: 0,
},

myStarImage: {
  width: 40,
  height: 40,
  resizeMode: 'contain',
},

myStarText: {
  color: '#f5e900',
  fontSize: 24,
  fontWeight: 'bold',
  marginLeft: -0,
},

sharePopupContainer: {
position: 'absolute',
left: 0,
right: 0,
bottom: 40,
height: height,
backgroundColor: 'rgba(0,0,0,0.5)',
justifyContent: 'flex-end',
zIndex: 9999,
},

sharePopup: {
backgroundColor: '#1c1c1e',
borderTopLeftRadius: 20,
borderTopRightRadius: 20,
paddingTop: 16,
paddingBottom: 24,
},

shareHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 16,
  marginBottom: 14,
},
shareTitle: {
  color: '#fff',
  fontSize: 16,
  fontWeight: 'bold',
},
shareAppsRow: {
  paddingHorizontal: 10,
  paddingVertical: 10,
},
shareItem: {
  width: 74,
  alignItems: 'center',
  marginHorizontal: 2,
},
shareCircle: {
  width: 52,
  height: 52,
  borderRadius: 26,
  justifyContent: 'center',
  alignItems: 'center',
},
shareCircleDark: {
  width: 52,
  height: 52,
  borderRadius: 26,
  backgroundColor: '#3a3a3c',
  justifyContent: 'center',
  alignItems: 'center',
},
shareItemText: {
  color: '#ddd',
  fontSize: 11,
  marginTop: 6,
  textAlign: 'center',
},



shareBtn:{
  backgroundColor:'#FFD700',

  width:230,          // button ki lambai
  height:45,          // button ki unchai

  borderRadius:20,

  justifyContent:'center',
  alignItems:'center',

  marginLeft:5,      // left-right move
  marginRight:0,

  marginTop:0,        // upar-niche move
  marginBottom:0,
},

shareText: {
color: '#000',
fontWeight: 'bold',
fontSize: 18,
textAlign: 'center',
},


actionRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  marginBottom: 15,
},

reportBtn: {
  backgroundColor: '#ff3333',
  width: '48%',
  paddingVertical: 10,
  borderRadius: 12,
},

saveBtn: {
  backgroundColor: '#3498db',
  width: '48%',
  paddingVertical: 10,
  borderRadius: 12,
},

reportText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 14,
},

saveText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 14,
},

shareRow:{
  flexDirection:'row',
  alignItems:'center',
  justifyContent:'space-between',
  marginTop:10,
},

logoBtn:{
  width:60,
  height:60,
  borderRadius:45,      // gola banayega
  overflow:'hidden',    // image ko circle ke andar rakhega
  justifyContent:'center',
  alignItems:'center',
  backgroundColor:'#000',
},

shareLogo:{
  width:100,
  height:100,
  borderRadius:25,     // image ko gol karega
  resizeMode:'cover',  // poora circle fill karega
},


userRow: {
  flexDirection: "row",
  alignItems: "center",
},

badge: {
  marginLeft: 5,
  width: 18,
  height: 18,
  justifyContent: "center",
  alignItems: "center",
  position: "relative",
},

badgeTick: {
  position: "absolute",
  top: 4.6,
  left: 4.2,
},

musicTextContainer:{
flex:1,
overflow:"hidden",
},

musicText:{
color:"#fff",
fontSize:13,
fontWeight:"600",
width:400,
},


});   
