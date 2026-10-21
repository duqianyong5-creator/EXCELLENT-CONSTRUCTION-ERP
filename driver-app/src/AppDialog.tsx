import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, space, font, weight, radius, hit, shadow } from './theme';


type Btn = { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' };
type DialogState = { visible: boolean; title: string; message?: string; buttons: Btn[] };

// 全局可调用的主题化弹窗（替代系统白底 Alert.alert，与 App 的卡片+琥珀风格统一）
let _show: (title: string, message?: string, buttons?: Btn[]) => void = () => {};

export function showAppAlert(title: string, message?: string, buttons?: Btn[]) {
  _show(title, message, buttons);
}

export default function AppDialog() {
  const [s, setS] = useState<DialogState>({ visible: false, title: '', buttons: [] });

  useEffect(() => {
    _show = (title, message, buttons) =>
      setS({ visible: true, title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] });
    return () => { _show = () => {}; };
  }, []);

  const close = () => setS((p) => ({ ...p, visible: false }));
  const handle = (b: Btn) => { close(); if (b.onPress) setTimeout(b.onPress, 10); };

  // Three or more choices stack vertically; one or two sit side by side
  const stacked = s.buttons.length > 2;

  return (
    <Modal visible={s.visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{s.title}</Text>
          {!!s.message && <Text style={styles.message}>{s.message}</Text>}
          <View style={[styles.btnRow, stacked && styles.btnCol]}>
            {s.buttons.map((b, i) => {
              const cancel = b.style === 'cancel';
              const danger = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    stacked && styles.btnFull,
                    cancel ? styles.btnCancel : danger ? styles.btnDanger : styles.btnPrimary,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => handle(b)}
                >
                  <Text
                    style={[
                      styles.btnText,
                      cancel ? styles.btnTextCancel : danger ? styles.btnTextDanger : styles.btnTextPrimary,
                    ]}
                    numberOfLines={1}
                  >
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // The scrim covers any page, so it is not one of the palette's surfaces: a translucent navy
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    ...shadow.raised,
  },
  title: {
    color: colors.text,
    fontSize: font.lg,
    lineHeight: 24,
    fontWeight: weight.heavy,
  },
  message: {
    color: colors.textMuted,
    fontSize: font.base,
    lineHeight: 24,
    marginTop: space.sm,
  },
  btnRow: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
  },
  btnCol: {
    flexDirection: 'column',
  },
  btn: {
    flex: 1,
    // 对话框按钮是最常被误点的地方，给足可点高度（司机可能戴手套）
    minHeight: hit.min,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {
    flex: 0,
    width: '100%',
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnDanger: {
    backgroundColor: colors.danger,
  },
  btnCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  btnText: {
    fontSize: font.base,
    fontWeight: weight.bold,
  },
  btnTextPrimary: {
    color: colors.onAccent,
  },
  btnTextDanger: {
    color: colors.heroText,
  },
  btnTextCancel: {
    color: colors.text,
  },
});
