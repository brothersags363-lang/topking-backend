import React from 'react';
import {
View,
TouchableOpacity,
Text,
StyleSheet,
Platform,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
useRouter,
usePathname,
} from 'expo-router';

export default function CustomBottomMenu() {

const router = useRouter();
const pathname = usePathname();

const getIconColor = (path: string) => {
return pathname === path
? '#3498db'
: '#fff';
};

return ( <View style={styles.bottomSection}>

  <View style={styles.bottomNavContainer}>

    <View style={styles.bottomNav}>

      {/* HOME */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => router.push('/')}
      >
        <Ionicons
          name="home-outline"
          size={26}
          color={getIconColor('/')}
        />
      </TouchableOpacity>

      {/* SEARCH */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => router.push('/explore')}
      >
        <Ionicons
          name="search"
          size={26}
          color={getIconColor('/explore')}
        />
      </TouchableOpacity>

      {/* PLUS */}
      <View style={styles.navItem}>
        <TouchableOpacity
          style={styles.plusBtn}
          onPress={() => router.push('/camera')}
        >
          <Text style={styles.plusText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* MESSAGE */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => router.push('/messages')}
      >
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={26}
          color={getIconColor('/messages')}
        />
      </TouchableOpacity>

      {/* PROFILE */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => router.push('/profile')}
      >
        <Ionicons
          name="person-outline"
          size={26}
          color={getIconColor('/profile')}
        />
      </TouchableOpacity>

    </View>

  </View>

  <View style={styles.bottomFill} />

</View>


);
}

const styles = StyleSheet.create({

bottomSection: {
position: 'absolute',
bottom: 0,
width: '100%',
backgroundColor: '#000',
},

bottomNavContainer: {
width: '100%',
backgroundColor: '#000',
height: 60,
justifyContent: 'center',
marginBottom: 20,
},

bottomNav: {
flexDirection: 'row',
alignItems: 'center',
flex: 1,
},

navItem: {
flex: 1,
alignItems: 'center',
justifyContent: 'center',
},

plusBtn: {
backgroundColor: '#f1c40f',
width: 48,
height: 32,
borderRadius: 8,
justifyContent: 'center',
alignItems: 'center',
elevation: 5,
},

plusText: {
fontSize: 26,
fontWeight: 'bold',
color: '#000',
lineHeight: 30,
},

bottomFill: {
backgroundColor: '#000',
width: '100%',
height:
Platform.OS === 'ios'
? 35
: 15,
},

});
