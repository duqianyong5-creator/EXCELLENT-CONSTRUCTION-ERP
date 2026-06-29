import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../../src/store';
import { useLang } from '../../src/i18n';
import AnnouncementModal from '../../src/AnnouncementModal';

const AMBER = '#F59E0B';

const ICONS: Record<string, { active: string; inactive: string }> = {
  tasks: { active: 'list', inactive: 'list-outline' },
  tracking: { active: 'calendar', inactive: 'calendar-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icon = ICONS[name] || ICONS.tasks;
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
      <Ionicons
        name={(focused ? icon.active : icon.inactive) as any}
        size={23}
        color={focused ? AMBER : '#64748b'}
      />
    </View>
  );
}

export default function TabLayout() {
  const { user } = useSelector((s: RootState) => s.auth);
  const { t } = useLang();
  const role = user?.role || '';
  const showTracking = role === 'client' || role === 'admin' || role === 'dispatcher';
  const tasksTitle = role === 'driver' ? '任务' : t('tab.tasks');
  const trackingTitle = role === 'driver' ? '当日任务' : t('tab.location');
  const profileTitle = role === 'driver' ? '个人中心' : t('tab.profile');

  return (
    <>
    <AnnouncementModal />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: AMBER,
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#0B0F1A',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: 78,
          paddingTop: 8,
          paddingBottom: 14,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="tasks"
        options={{
          title: tasksTitle,
          tabBarIcon: ({ focused }) => <TabIcon name="tasks" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          href: showTracking ? undefined : null,
          title: trackingTitle,
          tabBarIcon: ({ focused }) => <TabIcon name="tracking" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: profileTitle,
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 46,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerActive: {
    backgroundColor: 'rgba(245,158,11,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.22)',
  },
});
