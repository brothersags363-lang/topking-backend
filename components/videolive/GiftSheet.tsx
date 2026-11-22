// @ts-nocheck
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GIFT_PAGE_W, width, height } from './constants';
import { styles } from './styles';

export const GiftCard = memo(({ item, selected, onSelect }: any) => (
  <TouchableOpacity
    style={[styles.giftCard, selected && styles.giftCardSel]}
    activeOpacity={0.7}
    delayPressIn={0}
    onPress={() => onSelect(item)}
  >
    <Image source={item.icon} style={{ width: 38, height: 38 }} resizeMode="contain" fadeDuration={0} />
    <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
      <Ionicons name="star" size={9} color="#8E8E93" />
      <Text style={styles.giftCoin}>{item.price}</Text>
    </View>
  </TouchableOpacity>
));

export const GiftPage = memo(({ page, selectedId, onSelect }: any) => (
  <View style={{ width: GIFT_PAGE_W, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" }}>
    {page.items.map((item: any) => (
      <GiftCard key={item.id} item={item} selected={String(item.id) === String(selectedId)} onSelect={onSelect} />
    ))}
  </View>
));

