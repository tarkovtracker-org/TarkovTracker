import { reactive } from "vue";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";

const { hostname } = new URL(document.location.href);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const fireapp = initializeApp(firebaseConfig);
const analytics = getAnalytics(fireapp);
const auth = getAuth(fireapp);
const firestore = getFirestore(fireapp);
const functions = getFunctions(fireapp);

// Set up a reactive object for using the user object from auth
const fireuser = reactive({});
onAuthStateChanged(auth, function (user) {
  if (user) {
    Object.assign(fireuser, user);
    fireuser.loggedIn = true;
  } else {
    Object.keys(fireuser).forEach((key) => {
      delete fireuser[key];
    });
  }
});

//Use emulators if we're localhost
if (window.location.hostname === "localhost") {
  connectFirestoreEmulator(firestore, "localhost", 5002);
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectAuthEmulator(auth, "http://localhost:9099");
}

// Create a compatibility layer for the old firebase object
const firebase = {
  app: fireapp,
  auth: auth,
  firestore: firestore,
  functions: functions,
  GoogleAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
};

export { firebase, fireapp, analytics, fireuser, auth, firestore, functions };
