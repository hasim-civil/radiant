/**
 * Firebase Configuration and Initialization
 * 
 * IMPORTANT: Replace the firebaseConfig object below with your own Firebase project credentials.
 * 
 * To get your Firebase config:
 * 1. Go to Firebase Console (https://console.firebase.google.com)
 * 2. Select your project (or create a new one)
 * 3. Click the gear icon > Project settings
 * 4. Scroll down to "Your apps" section
 * 5. Click the web icon (</>) to add a web app if you haven't
 * 6. Copy the firebaseConfig object
 */

// Firebase Configuration - REPLACE WITH YOUR OWN CREDENTIALS
const firebaseConfig = {
  apiKey: "AIzaSyCV5s37swaoIizaNeZfz-89pJsMMsLhQtM",
  authDomain: "attendance-af550.firebaseapp.com",
  projectId: "attendance-af550",
  storageBucket: "attendance-af550.firebasestorage.app",
  messagingSenderId: "323294791225",
  appId: "1:323294791225:web:79901032c281d22b342fe8",
  measurementId: "G-8HX40K5M6E"
};
// Import Firebase modules from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export Firebase instances and functions for use in other modules
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;

// Export auth functions
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.signOut = signOut;
window.sendPasswordResetEmail = sendPasswordResetEmail;
window.onAuthStateChanged = onAuthStateChanged;
window.updateProfile = updateProfile;

// Export Firestore functions
window.collection = collection;
window.doc = doc;
window.setDoc = setDoc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.updateDoc = updateDoc;
window.deleteDoc = deleteDoc;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;
window.Timestamp = Timestamp;

console.log('Firebase initialized successfully');
