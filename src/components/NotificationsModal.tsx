// 메인화면 헤더의 알림(종) 아이콘을 누르면 뜨는 알림 목록 창.
// 안읽은 알림은 좌측에 빨간 점으로 표시하고, 행을 누르면 읽음 처리된다.
// 읽은 알림에만 삭제(X) 버튼이 나타난다 - 안읽은 알림은 먼저 확인해야 지울 수 있다.
import React from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

import { colors, fonts } from '../theme/colors';
import { CloseIcon } from './icons';
import { useNotifications } from '../context/NotificationsContext';

export default function NotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { notifications, markAsRead, deleteNotification } = useNotifications();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.title}>알림</Text>

          {notifications.length === 0 ? (
            <Text style={styles.emptyHint}>새로운 알림이 없어요.</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {notifications.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.row}
                  onPress={() => markAsRead(n.id)}
                  activeOpacity={n.read ? 1 : 0.7}
                >
                  <View style={styles.dotWrap}>{!n.read && <View style={styles.unreadDot} />}</View>
                  <View style={styles.textGroup}>
                    <Text style={styles.rowTitle}>{n.title}</Text>
                    <Text style={styles.rowMessage}>{n.message}</Text>
                    <Text style={styles.rowTime}>{n.time}</Text>
                  </View>
                  {n.read && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteNotification(n.id)}
                      hitSlop={8}
                      accessibilityLabel={`${n.title} 알림 삭제`}
                    >
                      <CloseIcon size={14} color={colors.textGray} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  panel: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '75%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
  },
  title: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textGray,
    textAlign: 'center',
    paddingVertical: 20,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dotWrap: {
    width: 10,
    alignItems: 'center',
    paddingTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  textGroup: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  rowMessage: {
    fontSize: 13,
    color: colors.textGray2,
    marginTop: 3,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 11,
    color: colors.textGray,
    marginTop: 4,
  },
  deleteButton: {
    padding: 4,
  },
  closeButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  closeButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
});
