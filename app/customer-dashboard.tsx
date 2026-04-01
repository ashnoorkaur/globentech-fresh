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
import { isDarkMode, lightTheme, darkTheme } from './theme'; //  FIXED PATH
import { auth, db } from '../firebase/config';

export default function CustomerDashboard() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');

  const theme = isDarkMode ? darkTheme : lightTheme;

  useEffect(() => {
    const checkUser = async () => {
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

        if (userData.role === 'admin') {
          router.replace('/admin-dashboard');
          return;
        }

        setName(userData.name || 'User');
        setLoading(false);

      } catch (error) {
        router.replace('/login');
      }
    };

    checkUser();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  // ✅ Loading Screen
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#23408E" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      
      <Text style={[styles.title, { color: theme.text }]}>
        Customer Dashboard
      </Text>

      <Text style={[styles.subtitle, { color: theme.text }]}>
        Welcome, {name}
      </Text>

      {/* Orders */}
      <TouchableOpacity style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardText, { color: theme.text }]}>
           Orders
        </Text>
      </TouchableOpacity>

      {/* Create Order */}
      <TouchableOpacity style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardText, { color: theme.text }]}>
          Create Order
        </Text>
      </TouchableOpacity>

      {/* My Orders */}
      <TouchableOpacity style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardText, { color: theme.text }]}>
          My Orders
        </Text>
      </TouchableOpacity>

      {/* Settings */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card }]}
        onPress={() => router.push('/settings')}
      >
        <Text style={[styles.cardText, { color: theme.text }]}>
          Settings
        </Text>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const PRIMARY = '#23408E';
const BACKGROUND = '#EEF3F9';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
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
    color: PRIMARY,
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    color: '#374151',
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 3,
  },

  cardText: {
    fontSize: 16,
    color: '#111827',
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