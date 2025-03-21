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
  apiKey: "AIzaSyBsKRL4E1x1gJvpAxfz928tZkFG6Yarp8k",
  authDomain: "tarkovtracker-org.firebaseapp.com",
  projectId: "tarkovtracker-org",
  storageBucket: "tarkovtracker-org.firebasestorage.app",
  messagingSenderId: "818747951766",
  appId: "1:818747951766:web:84aa73880ab4bd651510b7",
  measurementId: "G-T1EESKHZPE",
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
