import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSelector } from 'react-redux';
import type { RootState } from './store';
import { announcementsApi } from './api';
import { useLang } from './i18n';

const AMBER = '#F59E0B';
const SEEN_KEY = 'seen_announcements';

const TARGET_LABEL: Record<string, { zh: string; en: string; color: string }> = {
  all: { zh: '全体', en: 'All', color: '#3b82f6' },
  client: { zh: '客户', en: 'Client', color: '#22c55e' },
  driver: { zh: '司机', en: 'Driver', color: AMBER },
};

export default function AnnouncementModal() {
  const { user } = useSelector((s: RootState) => s.auth);
  const { lang } = useLang();
  const [items, setItems] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  visibleRef.current = visible;

  // 拉取生效公告，挑出本机未看过的弹出。轮询 + 回到前台时再查，
  // 这样网页端刚发的公告即使 app 已经开着也能在 ~30 秒内弹出。
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      if (visibleRef.current) return; // 弹窗正开着就不打断
      try {
        const data: any = await announcementsApi.feed();
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return;
        let seen: string[] = [];
        try {
          const raw = await SecureStore.getItemAsync(SEEN_KEY);
          if (raw) seen = JSON.parse(raw);
        } catch { /* ignore */ }
        const unseen = list.filter((a: any) => !seen.includes(a.id));
        if (!cancelled && unseen.length) {
          setItems(unseen);
          setVisible(true);
        }
      } catch { /* ignore */ }
    };

    load();
    const interval = setInterval(load, 30000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [user?.id]);

  const dismiss = async () => {
    setVisible(false);
    try {
      const raw = await SecureStore.getItemAsync(SEEN_KEY);
      const seen: string[] = raw ? JSON.parse(raw) : [];
      const merged = Array.from(new Set([...seen, ...items.map((a) => a.id)]));
      await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify(merged.slice(-200)));
    } catch { /* ignore */ }
  };

  if (!visible || !items.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="megaphone" size={20} color={AMBER} />
            </View>
            <Text style={styles.headerTitle}>{lang === 'zh' ? '系统公告' : 'Announcements'}</Text>
          </View>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {items.map((a) => {
              const tg = TARGET_LABEL[a.targetRole] || TARGET_LABEL.all;
              return (
                <View key={a.id} style={styles.item}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{a.title}</Text>
                    <View style={[styles.badge, { backgroundColor: `${tg.color}22`, borderColor: `${tg.color}55` }]}>
                      <Text style={[styles.badgeText, { color: tg.color }]}>{lang === 'zh' ? tg.zh : tg.en}</Text>
                    </View>
                  </View>
                  <View style={styles.itemContentBox}>
                    <Text style={styles.itemContent}>{a.content}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{lang === 'zh' ? '我知道了' : 'Got it'}</Text>
          </TouchableOpacity>
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
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0F1626',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  item: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
    lineHeight: 22,
  },
  itemContentBox: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemContent: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#1a1206',
    fontSize: 15,
    fontWeight: '800',
  },
});
