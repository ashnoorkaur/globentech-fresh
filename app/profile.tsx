import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebase/config';
import { darkTheme, isDarkMode, lightTheme } from './theme';

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');

  const theme = isDarkMode ? darkTheme : lightTheme;

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;

      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        const snapshot = await get(ref(db, `users/${user.uid}`));
        const userData = snapshot.val();

        if (!userData) {
          router.replace('/login');
          return;
        }

        setName(userData.name || 'User');
        setEmail(userData.email || user.email || 'No email found');
        setRole(userData.role || 'customer');
        setLoading(false);
      } catch (error) {
        router.replace('/login');
      }
    };

    loadProfile();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#23408E" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Profile</Text>

      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.text }]}>Full Name</Text>
        <Text style={[styles.value, { color: theme.text }]}>{name}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.text }]}>Email</Text>
        <Text style={[styles.value, { color: theme.text }]}>{email}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.text }]}>Role</Text>
        <Text style={[styles.value, { color: theme.text }]}>{role}</Text>
      </View>

      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card }]}
        onPress={() => router.push('/settings')}
      >
        <Text style={[styles.linkText, { color: theme.text }]}>⚙️ Back to Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const PRIMARY = '#23408E';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },

  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    color: PRIMARY,
  },

  card: {
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 3,
  },

  label: {
    fontSize: 13,
    marginBottom: 6,
    opacity: 0.7,
  },

  value: {
    fontSize: 16,
    fontWeight: '600',
  },

  linkText: {
    fontSize: 16,
    fontWeight: '500',
  },

  logout: {
    marginTop: 20,
    backgroundColor: PRIMARY,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  logoutText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});