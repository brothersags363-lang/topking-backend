import { StyleSheet } from 'react-native';
import { BOTTOM_BAR_H, GLOW_COLOR, GLOW_OFFSET, GLOW_RADIUS, GLOW_SIZE, SEAT_CELL_W, SEAT_FRAME_OFFSET, SEAT_RADIUS, SEAT_SIZE, height, width } from './constants';

export const styles = StyleSheet.create({
  // ===== TopKing-style bottom bar + 3-line sheet =====
  moreSheet: { backgroundColor: '#1C1E2E', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingHorizontal: 12 },
  moreHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 12 },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  moreTile: { width: '25%', alignItems: 'center', marginBottom: 16 },
  moreIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  moreTxt: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 6, maxWidth: 74 },
  welcomeBox: { alignSelf: 'flex-start', maxWidth: '78%', marginHorizontal: 14, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(40,60,80,0.55)' },
  welcomeTxt: { color: '#fff', fontSize: 14, lineHeight: 20 },
  monthlyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8 },

  mainContainer: { flex: 1, backgroundColor: '#14465f' },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 8, marginTop: 6 },
  monthlyChip: {
    flexDirection: 'row', alignItems: 'center', marginLeft: 4,
    paddingHorizontal: 7, height: 26, borderRadius: 6, flexShrink: 1,
    backgroundColor: 'rgba(241,196,15,0.14)', borderWidth: 0.5, borderColor: 'rgba(241,196,15,0.35)',
  },
  monthlyTxt: { color: '#fff', fontSize: 10, fontWeight: '700', marginLeft: 3, flexShrink: 1 },
  chip: {
    flexDirection: 'row', alignItems: 'center', marginLeft: 4,
    paddingHorizontal: 8, height: 26, borderRadius: 13, flexShrink: 1,
    backgroundColor: 'rgba(0,0,0,0.42)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  chipTxt: { color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 3, flexShrink: 1 },
  pinned: {
    flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start',
    marginHorizontal: 14, marginTop: 2, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', maxWidth: '94%',
  },
  pinnedTxt: { color: '#fff', fontSize: 13, lineHeight: 18, marginLeft: 7, flexShrink: 1 },
  emojiBar: {
    position: 'absolute', left: 12, right: 12, borderRadius: 22, zIndex: 50,
    backgroundColor: 'rgba(20,16,48,0.96)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  loader: { flex: 1, backgroundColor: '#0A0B14', justifyContent: 'center', alignItems: 'center' },

  topHeader:{
    flexDirection:"row",
    justifyContent:"space-between",
    alignItems:"center",
    paddingHorizontal:12,
    paddingTop:10,
  },
  hostPillWrap: {
    flexDirection:'row', alignItems:'center',
    backgroundColor:'rgba(0,0,0,0.6)', borderRadius:26, flexShrink:1,
    paddingLeft:4, paddingRight:8, paddingVertical:4,
  },
  topHostImg: { width: 38, height: 38, borderRadius: 19 },
  roomNameText: { color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  coinRow: { flexDirection:'row', alignItems:'center', marginTop:1 },
  coinDot: { width:11, height:11, borderRadius:6, backgroundColor:'#f5c518', borderWidth:1, borderColor:'#c99a00' },
  coinTxt: { color:'#fff', fontSize:11, marginLeft:4, fontWeight:'700', textShadowColor:'rgba(0,0,0,0.9)', textShadowOffset:{width:0,height:1}, textShadowRadius:2 },
  plusBtn: { width:34, height:22, borderRadius:11, backgroundColor:'#FFE600', justifyContent:'center', alignItems:'center', marginLeft:8 },
  headerRight: { flexDirection:'row', alignItems:'center', flexShrink:0, marginLeft:6 },
  closeBtn: { marginLeft:10 },
  hostBadge: { flexDirection: 'row', alignItems: 'center' },
  viewRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, marginTop: 2 },
  onlineText: { color: '#fff', fontSize: 11, marginLeft: 4, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  liveTag: { backgroundColor: '#FF3B5C', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, marginLeft: 8 },
  liveTagText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  audienceAvatars: { flexDirection: 'row', alignItems: 'center' },
  miniRound: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreCount: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: -12, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  micGrid: { flexDirection: 'row', flexWrap: 'wrap', width: SEAT_CELL_W * 3, alignSelf: 'center', paddingTop: 14, marginTop: 4 },
  seatCell: { width: SEAT_CELL_W, alignItems: 'center', marginBottom: 8 },
  seatSquare: {
    width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: SEAT_RADIUS, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  seatSquareSpeaking: { borderColor: '#fff200', borderWidth: 2 },
  seatSquareOccupied: { borderWidth: 0, backgroundColor: 'transparent' },
  // profile photo = seat ka exact size aur exact shape
  seatAvatarImg: { width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: SEAT_RADIUS, backgroundColor: '#2a2b38' },
  speakGlowSolid: {
    position: 'absolute', top: GLOW_OFFSET, left: GLOW_OFFSET, width: GLOW_SIZE, height: GLOW_SIZE,
    borderRadius: GLOW_RADIUS, borderWidth: 3, borderColor: GLOW_COLOR, zIndex: 15, elevation: 15,
    shadowColor: GLOW_COLOR, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  speakGlowPulse: {
    position: 'absolute', top: GLOW_OFFSET, left: GLOW_OFFSET, width: GLOW_SIZE, height: GLOW_SIZE,
    borderRadius: GLOW_RADIUS, backgroundColor: 'rgba(46,230,166,0.35)', zIndex: 14, elevation: 14,
  },
  seatSpeakRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: SEAT_RADIUS, borderWidth: 2, borderColor: '#fff200' },
  // zIndex/elevation frame (zIndex 10) se zyada -> mute logo frame ke UPAR dikhega
  seatMuteBadge: { position: 'absolute', right: 2, bottom: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#e74c3c', justifyContent: 'center', alignItems: 'center', zIndex: 20, elevation: 20 },
  seatEmoji: { position: 'absolute', top: -6, right: -6, fontSize: 22 },
  seatHostPill: { position: 'absolute', bottom: SEAT_FRAME_OFFSET - 4, zIndex: 30, elevation: 30, backgroundColor: '#2f7bf5', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 1 },
  seatHostPillTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  seatLabelPill: { marginTop: -SEAT_FRAME_OFFSET + 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1.5, maxWidth: SEAT_CELL_W - 8 },
  seatLabel: { color: '#fff', fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  seatCoinRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1 },
  seatCoinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f5c518' },
  seatCoinTxt: { color: '#fff', fontSize: 9, marginLeft: 4, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  seatItem: { width:width*0.20, alignItems: 'center', marginBottom: 15 },
  avatarBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151728' },
  hostBorder: { borderWidth: 2.5, borderColor: '#f1c40f' },

  speakerBorder: { borderWidth: 1.5, borderColor: '#8e44ad' },
  emptyBorder: { borderWidth: 1.5, borderColor: '#2c3e50', borderStyle: 'dashed' },
  avatarMain: { width: '100%', height: '100%', borderRadius: 34 },
  hostTag: { position: 'absolute', top: -5, backgroundColor: '#f1c40f', borderRadius: 6, paddingHorizontal: 6 },
  tagLabel: { fontSize: 8, fontWeight: 'bold', color: '#000' },
  micIconOverlay: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#f1c40f', borderRadius: 10, padding: 3 },
  seatNameTxt: { color: '#95a5a6', fontSize: 10, marginTop: 8 },
  sysMessage: { backgroundColor: 'rgba(241, 196, 15, 0.08)', borderLeftWidth: 3, borderLeftColor: '#f1c40f', margin: 15, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  sysText: { color: '#f1c40f', fontSize: 11, flex: 1, marginHorizontal: 10 },

chatArea: {
    // seats + pinned notice ke neeche, bottom bar ke upar - bachi hui poori jagah (har mobile par same)
    flex: 1,
    minHeight: 0,
    marginTop: 6,
    paddingHorizontal: 10,
  },  

  chatRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
  chatAva: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2b38' },
  chatContent: { flex: 1, marginLeft: 10 },
  chatHeaderInline: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  chatUser: { color: '#fff', fontWeight: 'bold', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  bubble: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignSelf: 'flex-start' },
  chatMsg: { color: '#fff', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bottomNav: {
  // in-flow (absolute nahi): content ke neeche hamesha fixed jagah, har phone par same
  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10,
  minHeight: BOTTOM_BAR_H, backgroundColor: 'transparent' },
  inputBox: { flex: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginRight: 10 },
  inputBoxIdle: { flex: 0, width: 98, height: 38, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 19, paddingHorizontal: 10, marginRight: 2 },
  tikiIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  inputStyle: { color: '#fff', fontSize: 14, flex: 1 },
  actionCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  exitBox: { width: '80%', backgroundColor: '#1C1E2E', padding: 25, borderRadius: 20, alignItems: 'center' },
  exitTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  exitSub: { color: '#7f8c8d', textAlign: 'center', marginTop: 10 },
  btnRow: { flexDirection: 'row', marginTop: 25 },
  noBtn: { backgroundColor: '#34495e', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: '#e74c3c', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },


  raiseHandBtn: {
  backgroundColor: '#f1c40f',
  paddingHorizontal: 15,
  paddingVertical: 10,
  borderRadius: 20,
  marginRight: 10
},

raiseHandText: {
  color: '#000',
  fontWeight: 'bold'
},

bottomSheetOverlay:{
 flex:1,
 justifyContent:'flex-end',
 backgroundColor:'rgba(0,0,0,0.5)'
},

requestSheet:{
backgroundColor:'#1C1E2E',

maxHeight:height*0.70,
minHeight:height*0.50,

borderTopLeftRadius:25,
borderTopRightRadius:25,

padding:20
},

giftCircle:{
width:40,
height:40,
borderRadius:20,
  backgroundColor: "rgba(0,0,0,0.45)",
justifyContent:'center',
alignItems:'center',
marginLeft:8
},


giftOverlay:{
flex:1,
justifyContent:'flex-end',
backgroundColor:'rgba(0,0,0,0.4)'
},

giftSheet:{
backgroundColor:'#12071f',
overflow:'hidden',
borderTopWidth:1,
borderLeftWidth:StyleSheet.hairlineWidth,
borderRightWidth:StyleSheet.hairlineWidth,
borderColor:'rgba(245,196,81,0.35)',

maxHeight:height*0.52,

borderTopLeftRadius:22,
borderTopRightRadius:22,

paddingTop:16,
paddingHorizontal:12,
paddingBottom:14
},

giftGoldLine:{
position:'absolute',
top:0,
left:'25%',
right:'25%',
height:2,
borderRadius:2,
backgroundColor:'rgba(245,196,81,0.9)'
},

giftTitle:{
color:'#FFE9A8',
fontSize:17,
fontWeight:'bold',
marginBottom:0
},

giftGrid:{
flexDirection:'row',
flexWrap:'wrap',
justifyContent:'space-between',
paddingHorizontal:0
},

giftCard:{
width:'22.5%',
marginRight:'2%',
backgroundColor:'rgba(255,255,255,0.07)',
borderWidth:StyleSheet.hairlineWidth,
borderColor:'rgba(245,196,81,0.28)',
borderRadius:12,
padding:5,
marginBottom:10,
alignItems:'center'
},

giftEmoji:{
fontSize:24
},

giftName:{
color:'#fff',
fontSize:10,
marginTop:0
},

giftCoin:{
color:'#F5C451',
fontWeight:'700',
fontSize:12,
marginTop:2
},

audienceContainer:{
marginTop:20,
paddingHorizontal:15
},

audienceTitle:{
color:'#fff',
fontSize:16,
fontWeight:'bold',
marginBottom:15
},

userBox:{
alignItems:'center',
marginRight:15
},

userImg:{
width:60,
height:60,
borderRadius:30,
borderWidth:2,
borderColor:'#ff1493'
},

userName:{
color:'#fff',
fontSize:12,
marginTop:5,
width:70,
textAlign:'center'
},

speakingBorder:{
borderWidth:4,
borderColor:"#00ff88",

shadowColor:"#00ff88",
shadowOffset:{
width:0,
height:0
},
shadowOpacity:1,
shadowRadius:20,

elevation:20
},


voicePulse:{
position:'absolute',

width:90,
height:90,
borderRadius:45,

backgroundColor:'rgba(0,255,136,0.25)',

borderWidth:3,
borderColor:'#00ff88'
},


bigGift:{
width:400,
height:400,
resizeMode:'contain'
},

giftEffectContainer:{
position:"absolute",
top:0,
left:0,
right:0,
bottom:0,
justifyContent:"center",
alignItems:"center",
zIndex:9999,
pointerEvents:"none"
},

requestBadge:{
  position:"absolute",
  top:-5,
  right:-5,

  backgroundColor:"#ff0000",

  minWidth:20,
  height:20,

  borderRadius:10,

  justifyContent:"center",
  alignItems:"center",

  paddingHorizontal:4,

  borderWidth:2,
  borderColor:"#0A0B14"
},

requestBadgeText:{
  color:"#fff",
  fontSize:10,
  fontWeight:"bold"
},

shareCircle: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: "#636b89",
  justifyContent: "center",
  alignItems: "center",
  marginLeft: 5,
marginRight: 12,

},


friendSheet:{
backgroundColor:"#000",
height:height*0.60,
borderTopLeftRadius:30,
borderTopRightRadius:30,
padding:20
},

friendTitle:{
color:"#fff",
fontSize:28,
fontWeight:"bold",
marginBottom:20
},

friendRow:{
flexDirection:"row",
alignItems:"center",
marginBottom:20
},

friendImg:{
width:55,
height:55,
borderRadius:28
},

friendName:{
color:"#fff",
fontSize:16,
fontWeight:"700",
},

toastBox:{
position:"absolute",
alignSelf:"center",
bottom:120,
backgroundColor:"rgba(20,22,34,0.96)",
paddingVertical:10,
paddingHorizontal:18,
borderRadius:22,
borderWidth:1,
borderColor:"rgba(0,255,136,0.45)",
zIndex:9999,
elevation:30,
},

toastText:{
color:"#fff",
fontWeight:"700",
fontSize:13,
},

sentBadge:{
backgroundColor:"rgba(0,255,136,0.15)",
borderColor:"#00ff88",
borderWidth:1,
paddingHorizontal:10,
paddingVertical:4,
borderRadius:12,
},

sentBadgeText:{
color:"#00ff88",
fontWeight:"bold",
fontSize:12,
},

radio:{
width:25,
height:25,
borderRadius:13,
borderWidth:2,
borderColor:"#fff"
},

radioSelected:{
backgroundColor:"#00ff88",
borderColor:"#00ff88"
},

shareBtn:{
backgroundColor:"#25D366",
padding:15,
borderRadius:15,
marginTop:10,
bottom:25,
},

shareText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},

sendBtn:{
backgroundColor:"#f71084",
padding:15,
borderRadius:10,
marginTop:15,
bottom:30,
},

sendText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},


viewerContainer:{
    flexDirection:"row",
    alignItems:"center",
},

viewerAvatar:{
    width:32,
    height:32,
    borderRadius:16,
    backgroundColor:"rgba(255,255,255,0.25)",
},

viewerCount:{
    minWidth:36,
    height:26,
    paddingHorizontal:8,
    borderRadius:6,
    backgroundColor:"transparent",
    justifyContent:"center",
    alignItems:"center",
    marginLeft:6,
},

viewerCountText:{
    color:"#fff",
    fontWeight:"bold",
    fontSize:12,
},

verifiedBadge:{
  marginLeft:6,
  justifyContent:"center",
  alignItems:"center",
},

levelBadge:{
  marginLeft:6,
  flexDirection:"row",
  alignItems:"center",
  borderWidth:1,
  paddingHorizontal:8,
  paddingVertical:3,
  borderRadius:20,
},

chatVerifiedIcon: {
  marginLeft: 4,
  alignSelf: "center",
},



hostAvatarContainer:{
position:"relative",
justifyContent:"center",
alignItems:"center"
},





});         
