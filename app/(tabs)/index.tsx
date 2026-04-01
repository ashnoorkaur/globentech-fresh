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
import { auth, db } from '../../firebase/config';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const redirectByRole = (role: string) => {
    if (role === 'admin') {
      router.replace('../admin-dashboard');
    } else if (role === 'technician') {
      router.replace('../technician-dashboard');
    } else {
      router.replace('../dashboard'); 
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Information', 'Please enter email and password.');
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
        Alert.alert('Profile Missing', 'User data not found in database.');
        setLoading(false);
        return;
      }

      const userData = snapshot.val();
      const role = userData.role || 'customer';

      Alert.alert('Success', `Logged in as ${role}`);
      redirectByRole(role);
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential') {
        Alert.alert('Login Failed', 'Email or password is incorrect.');
      } else if (error.code === 'auth/user-not-found') {
        Alert.alert('Login Failed', 'No account found with this email.');
      } else if (error.code === 'auth/wrong-password') {
        Alert.alert('Login Failed', 'Incorrect password.');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Login Failed', 'Invalid email format.');
      } else {
        Alert.alert('Login Failed', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter your email first.');
      return;
    }

    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert(
        'Reset Link Sent',
        `A password reset link has been sent to ${email.trim()}.`
      );
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        Alert.alert('Reset Failed', 'No account found with this email.');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Reset Failed', 'Please enter a valid email address.');
      } else {
        Alert.alert('Reset Failed', error.message);
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>GlobenTech</Text>
        <Text style={styles.subtitle}>
          Laboratory Order Management System
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#94A3B8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading && !resetLoading}
        />

        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!loading && !resetLoading}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.showText}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleForgotPassword}
          disabled={resetLoading || loading}
        >
          <Text style={styles.forgotText}>
            {resetLoading ? 'Sending reset link...' : 'Forgot Password?'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.loginButton, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || resetLoading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/signup')}>
          <Text style={styles.linkText}>Don’t have an account? Sign Up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const PRIMARY = '#23408E';
const BACKGROUND = '#EEF3F9';
const CARD = '#FFFFFF';
const TEXT = '#1F2937';
const SUBTEXT = '#6B7280';
const BORDER = '#D9E2F1';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: PRIMARY,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: SUBTEXT,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
    color: TEXT,
  },
  passwordWrapper: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFD',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT,
    paddingVertical: 14,
  },
  showText: {
    color: PRIMARY,
    fontWeight: '600',
    marginLeft: 10,
  },
  forgotText: {
    textAlign: 'right',
    color: PRIMARY,
    fontWeight: '600',
    marginBottom: 16,
    fontSize: 13,
  },
  loginButton: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  linkText: {
    textAlign: 'center',
    marginTop: 18,
    color: PRIMARY,
    fontWeight: '600',
  },
});