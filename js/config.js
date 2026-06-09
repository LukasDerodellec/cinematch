// ─────────────────────────────────────────────
//  CONFIGURATION — à remplir avant de déployer
// ─────────────────────────────────────────────

// 1. Clé API TMDB (gratuite sur https://www.themoviedb.org/settings/api)
const TMDB_API_KEY = '226fa4b8ea012b98ca3e223234d07733';

// 2. Config Firebase (https://console.firebase.google.com)
//    Créez un projet → Realtime Database → Ajouter une app web → copier firebaseConfig
const firebaseConfig = {
  apiKey: "AIzaSyAd1ee183Ntb4g35_EOnizN5NFDi8d2qn8",
  authDomain: "cinematch-f5c1a.firebaseapp.com",
  databaseURL: "https://cinematch-f5c1a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cinematch-f5c1a",
  storageBucket: "cinematch-f5c1a.firebasestorage.app",
  messagingSenderId: "216426577499",
  appId: "1:216426577499:web:48bd10c36a07f2998f097e"
};

// Nombre de films à charger par session
const MOVIES_PER_SESSION = 20;
