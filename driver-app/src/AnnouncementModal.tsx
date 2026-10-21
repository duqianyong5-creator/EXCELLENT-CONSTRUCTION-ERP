import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, AppState, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootState } from './store';
import { announcementsApi } from './api';
import { useLang } from './i18n';
import { colors, space, font, weight, radius, hit, shadow } from './theme';

const SEEN_KEY = 'seen_announcements';

const TARGET_LABEL: Record<string, { key: string; color: string; soft: string }> = {
  all: { key: 'ann.targetAll', color: colors.info, soft: colors.infoSoft },
  client: { key: 'role.client', color: colors.success, soft: colors.successSoft },
  driver: { key: 'role.driver', color: colors.accentDark, soft: colors.accentSoft },
};

export default function AnnouncementModal() {
  const { user } = useSelector((s: RootState) => s.auth);
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
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

  const formatDate = (value: unknown) => {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(t('common.dateLocale'), { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="megaphone" size={20} color={colors.accent} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>{t('ann.title')}</Text>
          </View>

          {/* The list takes at most half the screen so the button stays in reach */}
          <ScrollView
            style={{ maxHeight: Math.round(screenHeight * 0.5) }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {items.map((a, i) => {
              const tg = TARGET_LABEL[a.targetRole] || TARGET_LABEL.all;
              const date = formatDate(a.createdAt);
              return (
                <View key={a.id} style={[styles.item, i > 0 && styles.itemDivider]}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{a.title}</Text>
                    <View style={[styles.badge, { backgroundColor: tg.soft }]}>
                      <Text style={[styles.badgeText, { color: tg.color }]}>{t(tg.key)}</Text>
                    </View>
                  </View>
                  <Text style={styles.itemContent}>{a.content}</Text>
                  {!!date && <Text style={styles.itemDate}>{date}</Text>}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{t('ann.gotIt')}</Text>
          </TouchableOpacity>
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
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    ...shadow.raised,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  headerIcon: {
    width: hit.compact,
    height: hit.compact,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: font.lg,
    fontWeight: weight.heavy,
  },
  item: {
    paddingVertical: space.md,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: space.sm,
  },
  itemTitle: {
    // 标题长了要自己收窄，不能顶到右边的标签上
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: font.base,
    lineHeight: 22,
    fontWeight: weight.bold,
  },
  badge: {
    flexShrink: 0,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: font.xs,
    fontWeight: weight.bold,
  },
  itemContent: {
    color: colors.text,
    fontSize: font.base,
    lineHeight: 24,
  },
  itemDate: {
    marginTop: space.sm,
    color: colors.textFaint,
    fontSize: font.xs,
    fontWeight: weight.medium,
  },
  button: {
    marginTop: space.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: hit.min,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: font.base,
    fontWeight: weight.heavy,
  },
});
