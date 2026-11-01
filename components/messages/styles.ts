// Shared styles: row (MessageItem + FriendRow) aur modal (InfoModal + NotifModal)
import { StyleSheet } from 'react-native';
import { BADGE, MUTED } from './theme';

export const rs = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 28,
    paddingRight: 0,
    height: 76,
  },
  rowBody: { flex: 1, marginLeft: 12 },
  titleLine: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  tick: { marginLeft: 4 },
  subLine: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  subtitle: { color: MUTED, fontSize: 12.5, fontWeight: '500', flexShrink: 1 },
  time: { color: MUTED, fontSize: 11, fontWeight: '500', marginLeft: 6 },
  badgeSlot: { width: 46, alignItems: 'center', justifyContent: 'center' },
  rowBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    backgroundColor: BADGE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
});

export const ms = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '92%',
    height: '75%',
    backgroundColor: '#111',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
