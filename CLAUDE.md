# CineMatch

Application web "Tinder pour films" : deux personnes swipent chacune une liste
de films, et quand les deux ont swipé "oui" sur le même film, c'est un match —
ce sera le film de la soirée.

## Statut

✅ Fonctionnel et déployé.

- **Repo GitHub** : https://github.com/LukasDerodellec/cinematch
- **App en ligne** : https://lukasderodellec.github.io/cinematch/
- **Firebase project** : `cinematch-f5c1a` (Realtime Database, région europe-west1)
- **TMDB** : clé API configurée dans `js/config.js`

## Stack

- Frontend pur (pas de build) : HTML / CSS / JS vanilla
- **Firebase Realtime Database** (compat SDK via CDN) pour synchroniser les
  deux utilisateurs en temps réel — pas d'auth, juste un `userId` aléatoire
  stocké en `sessionStorage`
- **TMDB API** (`/movie/popular`, `language=fr-FR`) pour la liste de films
- Hébergement : **GitHub Pages** (branche `main`, racine du repo)

## Structure des fichiers

```
index.html        — les 6 "écrans" de l'app (home, waiting, swipe, waiting-match, match, nomatch)
css/style.css      — thème sombre, animations Tinder (cartes, stamps OUI/NON)
js/config.js       — clés TMDB_API_KEY + firebaseConfig (déjà remplies)
js/app.js          — toute la logique
firebase.rules.json — règles à coller dans Firebase Console (Realtime DB > Règles)
SETUP.md           — guide pas-à-pas pour reconfigurer un nouveau projet TMDB/Firebase si besoin
```

## Logique applicative (js/app.js)

### Modèle de données Firebase

```
rooms/{roomId}/
  status: "waiting" | "swiping" | "matched" | "nomatch"
  movies: [ {id, title, poster_path, overview, release_date, vote_average}, ... ]  (20 films, fixés à la création)
  users: { [userId]: true }            (2 entrées max)
  swipes/{movieId}/{userId}: true|false
  done/{userId}: true                  (écrit quand un utilisateur a fini ses 20 films)
  matchedMovie: {...}                  (écrit seulement si match trouvé)
```

### Flux

1. **Créer une session** (`createRoom`) : fetch 2 pages TMDB populaires →
   shuffle → 20 films → écrit `rooms/{code6lettres}` avec `status: "waiting"`
   → écran "waiting" avec le code à partager.
2. **Rejoindre** (`joinRoom`) : lit la room par code, ajoute son `userId`,
   passe `status` à `"swiping"`, puis `startSwiping()` directement.
3. Côté créateur, `listenForPartner()` écoute `status` et déclenche
   `startSwiping()` dès que ça passe à `"swiping"`.
4. **Swipe** (`makeSwipeable` / boutons ♥ ✕) : drag CSS, au-delà de 80px →
   `flyOut` + `recordSwipe(movie, liked)` qui écrit
   `rooms/{roomId}/swipes/{movieId}/{userId}`.
5. **Détection de match en temps réel** (`watchForMatches`) : dès le début
   du swipe, les deux clients écoutent `swipes/` en continu. À chaque
   écriture (de l'un ou l'autre), `findMatch()` revérifie tous les films ;
   dès qu'un film a `true` pour les deux `userId`, `claimStatus('matched', movie)`
   passe `status` à `"matched"` via une **transaction** (le 1er client à
   réussir gagne, l'autre voit l'abort et ne fait rien) et écrit
   `matchedMovie`.
6. Quand un utilisateur a swipé les 20 films sans qu'un match ait encore été
   trouvé → écran "waiting-match" + `checkBothDone()` :
   - écrit `done/{userId} = true`
   - si les deux sont `done`, refait un dernier `findMatch()` et appelle
     `claimStatus('matched'|'nomatch', movie)`
7. Les deux écrans écoutent `status` (`listenForMatch`) → `"matched"` affiche
   le film (`loadMatchFromDB`), `"nomatch"` affiche l'écran d'échec ; dans les
   deux cas le listener `swipes/` est détaché (`.off()`).

## Bugs connus / corrigés

- **Corrigé** : l'utilisateur qui rejoignait (user 2) restait bloqué en
  chargement infini car `joinRoom()` ne déclenchait jamais
  `startSwiping()`. Fix : appel ajouté en fin de `joinRoom()`.
- **Corrigé** : le match ne s'affichait qu'après que les deux aient fini
  leurs 20 films. Fix : listener temps réel `watchForMatches()` +
  transaction Firebase `claimStatus()`.

## Limitations / pistes d'amélioration possibles

- Pas de gestion si un 3e utilisateur tente de rejoindre une room pleine
  (écrase silencieusement la 2e place dans `users`)
- Pas de nettoyage des rooms anciennes dans Firebase (vont s'accumuler)
- Films toujours en `popular` FR — pourrait ajouter un choix de genre/plateforme
- Les clés API (TMDB + Firebase) sont visibles publiquement dans le repo
  (normal pour ce type d'app cliente, mais à savoir)

## Déploiement (rappel)

```bash
cd /Users/drdc/cinematch
git add -A
git commit -m "..."
git push
```

GitHub Pages se met à jour automatiquement ~30s après le push.
