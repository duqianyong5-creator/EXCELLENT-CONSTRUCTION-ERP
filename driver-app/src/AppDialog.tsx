import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const AMBER = '#F59E0B';

type Btn = { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' };
type DialogState = { visible: boolean; title: string; message?: string; buttons: Btn[] };

// 全局可调用的主题化弹窗（替代系统白底 Alert.alert，与 App 暗色+琥珀风格统一）
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
                      cancel ? styles.btnTextCancel : { color: danger ? '#fff' : '#1a1206' },
                    ]}
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0F1626',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.22)',
    padding: 22,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  message: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  btnCol: {
    flexDirection: 'column',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {
    flex: 0,
    width: '100%',
  },
  btnPrimary: {
    backgroundColor: AMBER,
  },
  btnDanger: {
    backgroundColor: '#ef4444',
  },
  btnCancel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  btnTextCancel: {
    color: 'rgba(255,255,255,0.78)',
  },
});
