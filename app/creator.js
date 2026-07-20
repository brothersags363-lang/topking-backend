import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";

import {
  MaterialIcons,
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";

export default function Creator() {

  const cards = [
 
    {
      no: "2",
      icon: <Ionicons name="eye" size={45} color="#fff" />,
      t1: "Get 300+",
      t2: "Views",
    },
    {
      no: "3",
      icon: (
        <FontAwesome5
          name="balance-scale"
          size={39}
          color="#fff"
        />
      ),
      t1: "Get",
      t2: "Wealth",
      gold: true,
    },
    {
      no: "4",
      icon: (
        <MaterialIcons
          name="lock-open"
          size={45}
          color="#fff"
        />
      ),
      t1: "Go",
      t2: "Live",
      gold: true,
    },
    {
      no: "5",
      icon: (
        <MaterialCommunityIcons
          name="star"
          size={45}
          color="#f7ba04"
        />
      ),
      t1: "Get Star",
      t2: "in Video",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 }}
      >

        {/* Top Icon */}

        <View style={styles.verifyCircle}>
          <MaterialIcons
            name="verified"
            size={75}
            color="#fffffe"
          />
        </View>

        {/* Heading */}

        <Text style={styles.title}>VIDEO</Text>

        <Text style={styles.subTitle}>
          Complete 5 videos • Earn Rewards
        </Text>

        {/* Cards */}

        <View style={styles.row}>

          {cards.map((item, index) => (

            <View key={index} style={styles.card}>

              <View style={styles.numberCircle}>
                <Text style={styles.numberText}>
                  {item.no}
                </Text>
              </View>

              <View style={{ marginTop: 20 }}>
                {item.icon}
              </View>

              <Text style={styles.cardTitle}>
                {item.t1}
              </Text>

              <Text
                style={[
                  styles.cardSub,
                  item.gold && { color: "#FFD54F" },
                ]}
              >
                {item.t2}
              </Text>

            </View>

          ))}

        </View>



{/* ================= ENGLISH ================= */}

<View style={styles.infoBox}>



<Text style={styles.point}>
① <Text style={styles.yellow}> 5 videos</Text> completely.
</Text>

<Text style={styles.point}>
② Get <Text style={styles.yellow}>300+ Views</Text> on each video.
</Text>

<Text style={styles.point}>
③ Earn <Text style={styles.yellow}>Wealth (Coins)</Text> after completing the views.
</Text>

<Text style={styles.point}>
④ <Text style={styles.yellow}>Go Live</Text> in the app.
</Text>

<Text style={styles.point}>
⑤ Get a <Text style={styles.yellow}>Star</Text> on your video.
</Text>

</View>







{/* ================= YELLOW VERIFIED BADGE ================= */}


    {/* Top Icon */}

        <View style={styles.verifyCircle}>
          <MaterialIcons
            name="verified"
            size={75}
            color="#fbd606"
          />
        </View>

        {/* Heading */}

        <Text style={styles.title}>VIDEO</Text>

        <Text style={styles.subTitle}>
          Complete 5 videos • Earn Rewards
        </Text>

        {/* Cards */}


<View style={styles.infoBox}>

 
<Text style={styles.point}>
  ✓ Complete <Text style={styles.yellow}>10,000 Views</Text> on your first <Text style={styles.yellow}>5 Videos</Text> to unlock the <Text style={styles.yellow}>Yellow Verified Tick</Text>.
</Text>

<Text style={styles.point}>
  ✓ Your reports will have <Text style={styles.yellow}>higher priority</Text>. One report from a verified creator will be treated like <Text style={styles.yellow}>5 normal reports</Text>.
</Text>

<Text style={styles.point}>
  ✓ Enjoy <Text style={styles.yellow}>faster earnings</Text> and receive more opportunities as a verified creator.
</Text>

<Text style={styles.point}>
  ✓ Your account and videos will receive <Text style={styles.yellow}>higher visibility</Text>, helping you grow faster on the platform.
</Text>

<Text style={styles.point}>
  ✓ Gain <Text style={styles.yellow}>more trust and credibility</Text> with the Yellow Verified Tick.
</Text>

<Text style={styles.point}>
  ✓ Your <Text style={styles.yellow}>feedback and support requests</Text> will receive higher priority, helping you get faster responses.
</Text>

</View>





      </ScrollView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({

  safe: {
    flex: 1,
    backgroundColor: "#000",
  },

  verifyCircle: {
    marginTop: 35,
    alignItems: "center",
  },

  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    alignSelf: "center",
    marginTop: 8,
  },

  subTitle: {
    color: "#ccc",
    fontSize: 14,
    alignSelf: "center",
    marginBottom: 25,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 12,
  },

  card: {
    width: 80,
    height: 110,
    borderWidth: 1,
    borderColor: "#D4AF37",
    borderRadius: 15,
    alignItems: "center",
    backgroundColor: "#111",
    paddingHorizontal: 2,
  },

  numberCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#111",
    borderWidth: 2,
    borderColor: "#FFD54F",
    position: "absolute",
    top: -21,
    justifyContent: "center",
    alignItems: "center",
  },

  numberText: {
    color: "#FFD54F",
    fontWeight: "bold",
    fontSize: 20,
  },

  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 13,
    marginTop: -5,
  },

  cardSub: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 12,
  },

  infoBox: {
    marginTop: 15,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D4AF37",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#111",
  },

  headingTag: {
    backgroundColor: "#FFD54F",
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 14,
  },

  headingText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },

  point: {
    fontSize: 14,
    color: "#fff",
    marginBottom: 10,
    fontWeight: "600",
    lineHeight: 22,
  },

  yellow: {
    color: "#FFD54F",
    fontWeight: "bold",
  },

});