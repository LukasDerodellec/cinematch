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
  status: "waiting" | "swiping"
  movies: [ {id, title, poster_path, overview, release_date, vote_average}, ... ]  (20 films, fixés à la création)
  users: { [userId]: true }            (2 entrées max)
  swipes/{movieId}/{userId}: true|false
  done/{userId}: true                  (écrit quand un utilisateur a fini ses 20 films)
  result: { status: "matched", matchedMovie: {...} } | { status: "nomatch" }
          (écrit une seule fois, atomiquement, via transaction — voir claimStatus)
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
   est appelé.
6. Quand un utilisateur a swipé les 20 films sans qu'un match ait encore été
   trouvé → écran "waiting-match" + `checkBothDone()` :
   - écrit `done/{userId} = true`
   - si les deux sont `done`, refait un dernier `findMatch()` et appelle
     `claimStatus('matched'|'nomatch', movie)`
7. `claimStatus()` écrit `rooms/{roomId}/result` en **une seule transaction
   atomique** (`{status, matchedMovie}` ensemble) — abort si `result` existe
   déjà, donc un seul des deux clients "gagne", peu importe lequel.
8. Les deux écrans écoutent `result` (`listenForMatch`) : dès qu'il existe,
   `matchResolved = true`, le listener `swipes/` est détaché (`.off()`), puis
   `status: "matched"` affiche le film (`showMatch`) ou `"nomatch"` affiche
   l'écran d'échec.

## Bugs connus / corrigés

- **Corrigé** : l'utilisateur qui rejoignait (user 2) restait bloqué en
  chargement infini car `joinRoom()` ne déclenchait jamais
  `startSwiping()`. Fix : appel ajouté en fin de `joinRoom()`.
- **Corrigé** : le match ne s'affichait qu'après que les deux aient fini
  leurs 20 films. Fix : listener temps réel `watchForMatches()` +
  transaction Firebase `claimStatus()`.
- **Corrigé** : le timeout de fin d'animation (`flyOut`, 350ms) pouvait
  écraser un écran de match déjà affiché par `showScreen('waitingMatch')`.
  Fix : flag `matchResolved` vérifié avant de changer d'écran.
- **Corrigé** : le client qui déclenchait le match (2e à liker) ne voyait
  jamais l'écran de match. Cause : `status` et `matchedMovie` étaient écrits
  en 2 temps — la mise à jour optimiste locale de la transaction Firebase
  rendait `status: "matched"` visible AVANT que `matchedMovie` soit écrit,
  donc `loadMatchFromDB` lisait `null` et abandonnait silencieusement. Fix :
  écriture atomique unique dans `result` (voir modèle de données ci-dessus).

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
