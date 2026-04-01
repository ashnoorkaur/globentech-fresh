import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { auth, db } from '../firebase/config';
import { darkTheme, isDarkMode, lightTheme } from './theme';

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);

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
        setCreatedAt(userData.createdAt || '');
        setProfileImage(userData.profileImage || null);
        setLoading(false);
      } catch (error) {
        router.replace('/login');
      }
    };

    loadProfile();
  }, []);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow photo library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
      Alert.alert('Updated', 'Profile picture changed successfully.');
    }
  };

  const handleEditProfile = () => {
    Alert.alert('Coming Soon', 'Edit profile feature will be added later.');
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not available';
    const date = new Date(dateString);
    return date.toDateString();
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#23408E" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <Text style={[styles.title, { color: theme.text }]}>Profile</Text>

      <View style={[styles.profileCard, { backgroundColor: theme.card }]}>
        {/* <TouchableOpacity onPress={pickImage}>
          <Image
            source={
              profileImage
                ? { uri: profileImage }
                : require('../assets/images/default-avatar.png') 
            }
            
          /> 
        </TouchableOpacity> */}

        <View style={styles.profileTextArea}>
          <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
          <Text style={[styles.email, { color: theme.text }]}>{email}</Text>

          <TouchableOpacity style={styles.changePhotoButton} onPress={pickImage}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Account Information
        </Text>

        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: theme.text }]}>Full Name</Text>
          <Text style={[styles.value, { color: theme.text }]}>{name}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <Text style={[styles.value, { color: theme.text }]}>{email}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: theme.text }]}>Role</Text>
          <Text style={[styles.value, { color: theme.text }]}>{role}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: theme.text }]}>Status</Text>
          <Text style={[styles.value, { color: theme.text }]}>Active</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: theme.text }]}>Member Since</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {formatDate(createdAt)}
          </Text>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Quick Actions
        </Text>

        <TouchableOpacity style={styles.actionButton} onPress={handleEditProfile}>
          <Text style={styles.actionButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.secondaryButtonText}>Back to Settings</Text>
        </TouchableOpacity>
      </View>

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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 18,
  },

  profileCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
  },

  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#D1D5DB',
  },

  profileTextArea: {
    marginLeft: 16,
    flex: 1,
  },

  name: {
    fontSize: 21,
    fontWeight: 'bold',
    marginBottom: 4,
  },

  email: {
    fontSize: 14,
    marginBottom: 10,
  },

  changePhotoButton: {
    backgroundColor: '#E5ECFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },

  changePhotoText: {
    color: PRIMARY,
    fontWeight: '600',
  },

  infoCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    elevation: 3,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 14,
  },

  infoRow: {
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 3,
  },

  value: {
    fontSize: 16,
    fontWeight: '600',
  },

  actionButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },

  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  secondaryButton: {
    borderWidth: 1,
    borderColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: PRIMARY,
    fontWeight: '600',
    fontSize: 15,
  },

  logout: {
    marginTop: 6,
    backgroundColor: PRIMARY,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },

  logoutText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});