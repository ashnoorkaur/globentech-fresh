import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js",
  authDomain: "globentech-e6551.firebaseapp.com",
  databaseURL: "https://globentech-e6551-default-rtdb.firebaseio.com",
  projectId: "globentech-e6551",
  storageBucket: "globentech-e6551.firebasestorage.app",
  messagingSenderId: "623498084736",
  appId: "1:623498084736:web:c2a294cb18dfccaa2d4165",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const getReactNativePersistenceFactory = () => {
  const authModule = require("@firebase/auth/dist/rn/index.js") as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
  };
  return authModule.getReactNativePersistence;
};

const createAuth = () => {
  if (Platform.OS === "web") {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistenceFactory()(AsyncStorage) as never,
    });
  } catch {
    return getAuth(app);
  }
};

export const auth = createAuth();
export const db = getDatabase(app);
