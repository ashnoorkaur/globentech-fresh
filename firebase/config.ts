import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js",
  authDomain: "globentech-e6551.firebaseapp.com",
  databaseURL: "https://globentech-e6551-default-rtdb.firebaseio.com", // ✅ IMPORTANT
  projectId: "globentech-e6551",
  storageBucket: "globentech-e6551.firebasestorage.app",
  messagingSenderId: "623498084736",
  appId: "1:623498084736:web:c2a294cb18dfccaa2d4165",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);