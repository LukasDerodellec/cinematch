# CineMatch — Guide de configuration

## 1. Clé TMDB

1. Va sur [themoviedb.org](https://www.themoviedb.org/signup) → crée un compte gratuit
2. Paramètres → API → Demander une clé → Choisir "Developer"
3. Copie la **clé API (v3)**
4. Dans `js/config.js` remplace `VOTRE_CLE_TMDB_ICI` par ta clé

## 2. Firebase Realtime Database

1. Va sur [console.firebase.google.com](https://console.firebase.google.com)
2. Nouveau projet (donne-lui un nom)
3. **Build → Realtime Database → Créer une base**
   - Choisir la région (europe-west1 pour France)
   - Démarrer en **mode test** (pour commencer)
4. **Paramètres du projet → Ajouter une application web**
5. Copie le bloc `firebaseConfig` dans `js/config.js`
6. Dans la console Firebase → Realtime Database → Règles → colle le contenu de `firebase.rules.json`

## 3. Déployer sur GitHub Pages

```bash
cd cinematch
git init
git add .
git commit -m "init cinematch"
# Crée un repo GitHub "cinematch" (sans README)
git remote add origin https://github.com/TON_USERNAME/cinematch.git
git push -u origin main
```

Puis dans GitHub → Settings → Pages → Source = **main branch / root** → Save.

L'app sera disponible sur `https://TON_USERNAME.github.io/cinematch/`

## 4. Utilisation

1. Personne A ouvre l'app → **Créer une session** → reçoit un code à 6 lettres
2. Personne B ouvre l'app → **Rejoindre une session** → entre le code
3. Les deux swipent les films (droite = oui, gauche = non)
4. Si les deux swipent OUI sur le même film → 🎉 Match !
