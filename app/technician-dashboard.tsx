import { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { auth, db } from '../firebase/config';
import { get, ref } from 'firebase/database';
import { signOut } from 'firebase/auth';

export default function TechnicianDashboard() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');

  useEffect(() => {
    const checkRole = async () => {
      const user = auth.currentUser;

      if (!user) {
        router.replace('/login');
        return;
      }

      const snapshot = await get(ref(db, `users/${user.uid}`));
      const userData = snapshot.val();

      if (!userData || userData.role !== 'technician') {
        router.replace('/login'); // ❌ block others
        return;
      }

      setName(userData.name || 'Technician');
      setLoading(false);
    };

    checkRole();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Technician Dashboard</Text>

      <Text style={styles.subtitle}>Welcome, {name}</Text>

      {/* Technician features */}
      <TouchableOpacity style={styles.card}>
        <Text>View Assigned Tasks</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card}>
        <Text>Update Equipment Status</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card}>
        <Text>Manage Samples</Text>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Text style={{ color: '#fff' }}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#EEF3F9' },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#23408E',
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    marginBottom: 20,
  },

  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },

  logout: {
    marginTop: 20,
    backgroundColor: '#23408E',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
});