import { reactive } from 'vue';
import { initializeApp, FirebaseOptions, type FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics } from 'firebase/analytics';
import {
  getAuth,
  onAuthStateChanged,
  connectAuthEmulator,
  GoogleAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  User,
  Auth,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  Functions,
  httpsCallable,
} from 'firebase/functions';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
// Define a comprehensive type for our reactive user state
type FireUser = {
  uid: string | null;
  loggedIn: boolean;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
};
// Ensure all required environment variables are present
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;
// Check for missing environment variables
const missingEnvVars = requiredEnvVars.filter((varName) => !import.meta.env[varName]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}
// Use environment variables for Firebase config with proper typing
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL, // Added for Realtime Database
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // Google Analytics
};
// Initialize Firebase with error handling
let app: FirebaseApp;
let analytics: Analytics | undefined;
let auth: Auth;
let firestore: Firestore;
let functions: Functions;
let storage: FirebaseStorage;
try {
  app = initializeApp(firebaseConfig);
  if (import.meta.env.PROD) {
    analytics = getAnalytics(app);
  }
  auth = getAuth(app);
  firestore = getFirestore(app);
  functions = getFunctions(app, 'us-central1');
  storage = getStorage(app);
} catch (error) {
  console.error('Error initializing Firebase:', error);
  throw error;
}
// Set up a reactive object for our user state with comprehensive properties
const fireuser = reactive<FireUser>({
  uid: null,
  loggedIn: false,
  displayName: null,
  email: null,
  photoURL: null,
  emailVerified: false,
  phoneNumber: null,
  lastLoginAt: null,
  createdAt: null,
});
// Handle auth state changes with comprehensive user data
onAuthStateChanged(auth, (user: User | null) => {
  if (user) {
    fireuser.uid = user.uid;
    fireuser.loggedIn = true;
    fireuser.displayName = user.displayName;
    fireuser.email = user.email;
    fireuser.photoURL = user.photoURL;
    fireuser.emailVerified = user.emailVerified;
    fireuser.phoneNumber = user.phoneNumber;
    fireuser.lastLoginAt = user.metadata.lastSignInTime ?? null;
    fireuser.createdAt = user.metadata.creationTime ?? null;
  } else {
    // Reset all properties on logout
    Object.assign(fireuser, {
      uid: null,
      loggedIn: false,
      displayName: null,
      email: null,
      photoURL: null,
      emailVerified: false,
      phoneNumber: null,
      lastLoginAt: null,
      createdAt: null,
    });
  }
});
// Use emulators if we're on localhost or 127.0.0.1
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(firestore, 'localhost', 5002);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectStorageEmulator(storage, 'localhost', 9199);
  } catch (error) {
    console.error('Error connecting to Firebase emulators:', error);
  }
}
export {
  app,
  analytics,
  auth,
  firestore,
  functions,
  storage,
  fireuser,
  GoogleAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  httpsCallable, // Export httpsCallable for easy Cloud Functions usage
};
