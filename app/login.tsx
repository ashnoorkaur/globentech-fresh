import { router } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebase/config';

export default function LoginScreen() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const redirectByRole = (role: string) => {
  if (role === 'admin') {
    router.replace('/admin-dashboard');
  } else {
    router.replace('/customer-dashboard');   
  }
};

  // ✅ NORMAL LOGIN
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Information', 'Please enter email and password.');
      return;
    }

    if (!isValidEmail(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password.trim()
      );

      const user = userCredential.user;
      const snapshot = await get(ref(db, `users/${user.uid}`));

      if (!snapshot.exists()) {
        Alert.alert('Profile Missing', 'User data not found.');
        return;
      }

      const role = snapshot.val().role || 'customer';
      redirectByRole(role);

    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  // PLACEHOLDER (NO GOOGLE LOGIC)
  const handleGooglePlaceholder = () => {
    Alert.alert('Coming Soon', 'Google Sign-In will be added later.');
  };

  //FORGOT PASSWORD
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Enter your email first.');
      return;
    }

    if (!isValidEmail(email.trim())) {
      Alert.alert('Invalid Email', 'Enter valid email.');
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Success', 'Reset link sent.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>GlobenTech</Text>

       <TextInput
  style={styles.input}
  placeholder="Email address"
  placeholderTextColor="#9CA3AF"
  value={email}
  onChangeText={(text) => {
    if (text.length <= 40) setEmail(text);
  }}
  autoCapitalize="none"
  keyboardType="email-address"
/> 

       <View style={styles.passwordWrapper}>
  <TextInput
    style={styles.passwordInput}
    placeholder="Password"
    placeholderTextColor="#9CA3AF"
    value={password}
    onChangeText={setPassword}
    secureTextEntry={!showPassword}
  />
  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
    <Text style={styles.showText}>
      {showPassword ? 'Hide' : 'Show'}
    </Text>
  </TouchableOpacity>
</View> 

        <TouchableOpacity onPress={handleForgotPassword}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        {/* LOGIN */}
        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>Login</Text>}
        </TouchableOpacity>

        {/* GOOGLE PLACEHOLDER */}
        <TouchableOpacity style={styles.googleButton} onPress={handleGooglePlaceholder}>
          <Text style={{ color: '#23408E', textAlign: 'center' }}>
            Continue with Google (Coming Soon)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/signup')}>
          <Text style={styles.linkText}>Don’t have an account? Sign Up</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF3F9',
    justifyContent: 'center',
    padding: 20,
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#23408E',
    textAlign: 'center',
    marginBottom: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',   // ✅ THIS FIXES INVISIBLE TEXT
    marginBottom: 12,
  },

  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',   // ✅ IMPORTANT
    paddingVertical: 14,
  },

  showText: {
    color: '#23408E',
    fontWeight: '600',
    marginLeft: 10,
  },

  forgotText: {
    textAlign: 'right',
    color: '#23408E',
    fontWeight: '600',
    marginBottom: 16,
    fontSize: 13,
  },

  loginButton: {
    backgroundColor: '#23408E',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },

  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  googleButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },

  linkText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#23408E',
    fontWeight: '600',
  },
});