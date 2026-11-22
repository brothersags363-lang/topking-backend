import { View, Text, TouchableOpacity, Pressable, StyleSheet, Image, Alert } from 'react-native';
import LevelBar from '../live/LevelBar';
import { callApi } from '../../utils/api';
import { auth } from './feedShared';
import { styles } from './feedStyles';

export function StarPopup({ myStars, myTotalSpent, myWalletLevel, playStarAnimation, router, selectedStar, selectedVideoId, setSelectedStar, setShowStarPopup, setStarAnimationCount, setStarAnimationVideoId, starSending }: any) {
  return (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={() => setShowStarPopup(false)}
  />

  <View style={styles.starPopup}>

    <LevelBar
      totalSpent={myTotalSpent}
      walletLevel={myWalletLevel}
      onUpgrade={() => { setShowStarPopup(false); try { router.push('/wallet'); } catch (e) {} }}
    />

    <View style={styles.myStarBox}>

      <Image
        source={require('../../assets/star-logo.webp')}
        style={styles.myStarImage}
      />

      <Text style={styles.myStarText}>
        {myStars}
      </Text>

    </View>

    <View style={styles.starRow}>

      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 1 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(1)}
      >
        <Image
          source={require('../../assets/star-logo.webp')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x1</Text>

      </TouchableOpacity>


      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 3 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(3)}
      >
        <Image
          source={require('../../assets/star-logo.webp')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x3</Text>

      </TouchableOpacity>


      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 10 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(10)}
      >
        <Image
          source={require('../../assets/star-logo.webp')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x10</Text>

      </TouchableOpacity>

    </View>

  

<TouchableOpacity
style={styles.starSubmitBtn}
onPress={async()=>{

const user=auth.currentUser;

if(!user) return;

if(!selectedStar){
Alert.alert("Select Star");
return;
}

if(myStars<selectedStar){
Alert.alert("Not enough Stars");
return;
}

// double tap se 2 baar star na jaye
if(starSending.current) return;
starSending.current=true;

const giftAmount=selectedStar;

try{


setShowStarPopup(false);

setStarAnimationCount(giftAmount);

setStarAnimationVideoId(selectedVideoId);

setSelectedStar(null);

playStarAnimation();


await callApi("/gift/video-star",{
videoId:selectedVideoId,
stars:giftAmount
});

// myStars wallet snapshot se khud update hota hai (manual minus se double minus hota tha)

}catch(e){

__DEV__ && console.log(e);
Alert.alert("Star", (e as any)?.message || "Could not send star");

}finally{

starSending.current=false;

}

}}
>




      <Text style={styles.starSubmitText}>
        StarUp
      </Text>
    </TouchableOpacity>

  </View>

</View>

  );
}
