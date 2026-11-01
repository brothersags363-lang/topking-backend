// Creator Assistant / Official / System popup
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { INFO_CONTENT, InfoItem } from './data';
import { ms } from './styles';
import { MUTED } from './theme';

const keyExtractor = (i: InfoItem) => i.id;

const renderItem = ({ item }: { item: InfoItem }) => (
  <View style={s.item}>
    <View style={s.top}>
      <Text style={s.title}>{item.title}</Text>
      <Text style={s.time}>{item.time}</Text>
    </View>
    <Text style={s.body}>{item.body}</Text>
  </View>
);

type Props = { infoId: string | null; onClose: () => void };

const InfoModal = memo(function InfoModal({ infoId, onClose }: Props) {
  const content = infoId ? INFO_CONTENT[infoId] : null;

  return (
    <Modal visible={!!infoId} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ms.modalBackdrop}>
        <View style={ms.modalCard}>
          <View style={ms.modalHeader}>
            <Text style={ms.modalTitle}>{content?.title || ''}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={content?.items || []}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
});

export default InfoModal;

const s = StyleSheet.create({
  item: { padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#222' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  time: { color: MUTED, fontSize: 11, marginTop: 2 },
  body: { color: '#c7c7cc', fontSize: 13, lineHeight: 19, marginTop: 8 },
});
