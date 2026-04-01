import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { isDarkMode, setDarkMode } from './theme'; 
import { auth } from '../firebase/config';

export default function Settings() {
  const [darkMode, setDarkMode] = useState(isDarkMode); 

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* Profile */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/profile')}
      >
        <Text style={styles.cardText}>Profile</Text>
      </TouchableOpacity>

      {/* Dark Mode */}
      <View style={styles.cardRow}>
        <Text style={styles.cardText}>Dark Mode</Text>
        <Switch
  value={darkMode}
  onValueChange={(value) => {
    // setLocalDarkMode(value); 
    setDarkMode(value);
  }}
/> 
      </View>

      {/* Notifications */}
      <TouchableOpacity style={styles.card}>
        <Text style={styles.cardText}>Notifications</Text>
      </TouchableOpacity>

      {/* Privacy */}
      <TouchableOpacity style={styles.card}>
        <Text style={styles.cardText}>Privacy & Security</Text>
      </TouchableOpacity>

      {/* Help */}
      <TouchableOpacity style={styles.card}>
        <Text style={styles.cardText}>Help & Support</Text>
      </TouchableOpacity>

      {/* About */}
      <TouchableOpacity style={styles.card}>
        <Text style={styles.cardText}>About App</Text>
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

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: PRIMARY,
    marginBottom: 20,
  },

  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
  },

  cardRow: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  cardText: {
    fontSize: 16,
    color: '#111827',
  },

  logout: {
    marginTop: 20,
    backgroundColor: PRIMARY,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});