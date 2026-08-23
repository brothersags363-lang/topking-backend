import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  BackHandler,
  TouchableOpacity,
} from "react-native";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "./firebaseConfig";

import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";


export default function TopGifters() {

  const navigation = useNavigation();

  const [topGifters, setTopGifters] = useState([]);
  const [giftUserCount, setGiftUserCount] = useState(0);



// =========================
  // MOBILE BACK BUTTON
  // =========================

  useEffect(() => {

    const onBackPress = () => {

      if (navigation.canGoBack()) {

        navigation.goBack();

        return true;
      }

      return false;
    };


    const subscription =
      BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );


    return () => {
      subscription.remove();
    };

  }, [navigation]);


  useEffect(() => {

    const uid = auth.currentUser?.uid;

    if (!uid) {
      console.log(
        "❌ TopGifters: UID nahi mila"
      );
      return;
    }


    const userRef = doc(
      db,
      "users",
      uid
    );


    const unsubscribe = onSnapshot(
      userRef,

      (snapshot) => {

        if (!snapshot.exists()) {

          console.log(
            "❌ TopGifters: User document nahi mila"
          );

          setTopGifters([]);
          setGiftUserCount(0);

          return;
        }


        const userData = snapshot.data();


        console.log(
          "🔥 TOP GIFTERS RAW =",
          userData.topGifters
        );


        /*
         * Firestore me topGifters
         * OBJECT / MAP ke form me hai.
         */

        const topGiftersData =
          userData.topGifters || {};


        /*
         * OBJECT / MAP ko ARRAY me convert karna.
         */

        const gifters =
          Object.entries(
            topGiftersData
          ).map(
            ([gifterUid, gifter]) => {

              return {

                ...gifter,

                uid:
                  gifter.uid ||
                  gifterUid,

                name:
                  gifter.name ||
                  "",

                username:
                  gifter.username ||
                  "",

                profileImg:
                  gifter.profileImg ||
                  gifter.photoURL ||
                  gifter.photo ||
                  "",

                photo:
                  gifter.profileImg ||
                  gifter.photoURL ||
                  gifter.photo ||
                  "",

                stars:
                  Number(
                    gifter.stars || 0
                  ),

              };

            }
          );


        /*
         * Highest gifting wala
         * sabse upar.
         */

        gifters.sort(
          (a, b) =>
            Number(b.stars || 0) -
            Number(a.stars || 0)
        );


        /*
         * Total gifters count.
         */

        setGiftUserCount(
          gifters.length
        );


        /*
         * Saare gifters show karenge.
         * Top 3 ki limit hata di gayi hai.
         */

        setTopGifters(gifters);


        console.log(
          "🔥 FINAL GIFTERS =",
          gifters
        );

      },


      (error) => {

        console.log(
          "❌ TOP GIFTERS SNAPSHOT ERROR =",
          error
        );

      }

    );


    return () => unsubscribe();

  }, []);


  return (

    <View style={styles.container}>


      {/* =========================
          TITLE
      ========================= */}

      <Text style={styles.title}>
        Angels
      </Text>


      {/* =========================
          TOTAL GIFTER COUNT
      ========================= */}

      <View style={styles.totalRow}>

        <Text style={styles.totalLabel}>
          Total Gifters:
        </Text>

        <Text style={styles.totalCount}>
          {giftUserCount}
        </Text>

      </View>


      {/* =========================
          SCROLLABLE GIFTER LIST
      ========================= */}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >


        {topGifters.map(
          (item, index) => {

            const imageUri =
              item.profileImg ||
              item.photo ||
              item.photoURL ||
              item.profile ||
              item.avatar ||
              "";


            /*
             * Ranking:
             * 1, 2, 3, 4, 5, 6...
             */

            const rank = index + 1;


            return (

              <View
                key={
                  item.uid ||
                  `gifter-${index}`
                }
                style={styles.gifterRow}
              >


                {/* =====================
                    RANK NUMBER
                ===================== */}

                <View
                  style={styles.rankBox}
                >

                  <Text
                    style={styles.rankText}
                  >
                    {rank}
                  </Text>

                </View>


                {/* =====================
                    PROFILE IMAGE
                ===================== */}

                <TouchableOpacity
  style={styles.imageWrapper}
  activeOpacity={0.8}
  onPress={() => {

    console.log(
      "OPEN GIFTER PROFILE =",
      item.uid
    );

    if (!item.uid) {
      console.log("❌ Gifter UID nahi mila");
      return;
    }

    navigation.navigate("userProfile", {
      userId: item.uid,
    });

  }}
>

  {imageUri ? (

    <Image
      source={{
        uri: imageUri,
      }}
      style={styles.memberImg}
    />

  ) : (

    <View
      style={[
        styles.memberImg,
        styles.emptyImage,
      ]}
    >
      <Ionicons
        name="person"
        size={18}
        color="#999"
      />
    </View>

  )}

</TouchableOpacity>


                {/* =====================
                    USERNAME
                ===================== */}

                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={
                    styles.gifterName
                  }
                >

                  {item.username
                    ? `@${item.username}`
                    : item.name ||
                      "User"}

                </Text>


                {/* =====================
                    GIFTING STARS
                ===================== */}

                <View
                  style={
                    styles.starRow
                  }
                >

                  <Ionicons
                    name="star"
                    size={13}
                    color="#FFD700"
                  />

                  <Text
                    style={
                      styles.starText
                    }
                  >

                    {Number(
                      item.stars || 0
                    ).toLocaleString()}

                  </Text>

                </View>


              </View>

            );

          }
        )}


        {/* =========================
            EMPTY LIST
        ========================= */}

        {topGifters.length === 0 && (

          <View
            style={styles.emptyList}
          >

            <Ionicons
              name="gift-outline"
              size={30}
              color="#777"
            />

            <Text
              style={styles.emptyText}
            >
              No gifters yet
            </Text>

          </View>

        )}


      </ScrollView>


    </View>

  );

}


const styles = StyleSheet.create({

  /*
   * MAIN CONTAINER
   */

  container: {
    flex: 1,

    /*
     * BLACK BACKGROUND
     */

    backgroundColor: "#000",

    padding: 10,
  },


  /*
   * TITLE
   */

  title: {
    color: "#fff",

    fontSize: 18,

    fontWeight: "bold",
marginTop: 29,
    marginBottom: 15,
  },


  /*
   * TOTAL GIFTER ROW
   */

  totalRow: {
    flexDirection: "row",

    alignItems: "center",

    marginBottom: 10,
  },


  /*
   * TOTAL LABEL
   */

  totalLabel: {
    color: "#aaa",

    fontSize: 12,

    fontWeight: "600",
  },


  /*
   * TOTAL COUNT
   */

  totalCount: {
    color: "#FFD700",

    fontSize: 13,

    fontWeight: "bold",

    marginLeft: 5,
  },


  /*
   * SCROLL VIEW
   */

  scrollView: {
    flex: 1,

    backgroundColor: "#000",
  },


  /*
   * SCROLL CONTENT
   */

  scrollContent: {
    paddingBottom: 20,
  },


  /*
   * EACH GIFTER
   *
   * RANK → PHOTO → NAME → STAR
   */

  gifterRow: {
    flexDirection: "row",

    alignItems: "center",

    minHeight: 48,

    paddingVertical: 4,

    borderBottomWidth: 1,

    borderBottomColor: "#171717",
  },


  /*
   * RANK NUMBER BOX
   */

  rankBox: {
    width: 28,

    alignItems: "center",

    justifyContent: "center",

    marginRight: 4,
  },


  /*
   * RANK NUMBER
   */

  rankText: {
    color: "#fff",

    fontSize: 14,

    fontWeight: "bold",
  },


  /*
   * PROFILE IMAGE BORDER
   */

  imageWrapper: {
    width: 40,

    height: 40,

    borderRadius: 20,

    borderWidth: 2,

    borderColor: "#FFD700",

    backgroundColor: "#222",

    overflow: "hidden",

    marginRight: 6,
  },


  /*
   * PROFILE IMAGE
   */

  memberImg: {
    width: 36,

    height: 36,

    borderRadius: 18,

    resizeMode: "cover",
  },


  /*
   * EMPTY PROFILE
   */

  emptyImage: {
    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#222",
  },


  /*
   * USERNAME
   */

  gifterName: {
    color: "#fff",

    fontSize: 11,

    fontWeight: "600",

    width: 85,

    marginRight: 5,
  },


  /*
   * STAR ROW
   */

  starRow: {
    flexDirection: "row",

    alignItems: "center",

    marginLeft: "auto",

    minWidth: 65,

    justifyContent: "flex-end",

    paddingRight: 5,
  },


  /*
   * STAR NUMBER
   */

  starText: {
    color: "#FFD700",

    fontSize: 11,

    fontWeight: "bold",

    marginLeft: 2,
  },


  /*
   * EMPTY LIST
   */

  emptyList: {
    alignItems: "center",

    justifyContent: "center",

    paddingVertical: 30,
  },


  /*
   * EMPTY TEXT
   */

  emptyText: {
    color: "#777",

    fontSize: 12,

    marginTop: 6,
  },

});