// ── Init Firebase ──────────────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

// ── State ──────────────────────────────────────────────────────────────────
let roomId = null;
let userId = sessionStorage.getItem('uid') || (() => {
  const id = Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem('uid', id);
  return id;
})();
let movies = [];
let currentIndex = 0;
let matchResolved = false;

// ── DOM refs ──────────────────────────────────────────────────────────────
const screens = {
  lock:         document.getElementById('screen-lock'),
  home:         document.getElementById('screen-home'),
  waiting:      document.getElementById('screen-waiting'),
  swipe:        document.getElementById('screen-swipe'),
  waitingMatch: document.getElementById('screen-waiting-match'),
  match:        document.getElementById('screen-match'),
  nomatch:      document.getElementById('screen-nomatch'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Access gate (easter egg) ────────────────────────────────────────────────
// The site stays on a logo-only "lock" screen until someone clicks the logo
// 5 times, which toggles a shared `appState/open` flag in Firebase. Same
// gesture on the home screen logo locks it again for future visitors.
let logoClickCount = 0;
let logoClickTimer = null;

function setupLogoToggle(logoEl) {
  logoEl.addEventListener('click', () => {
    logoEl.classList.add('logo-tap');
    setTimeout(() => logoEl.classList.remove('logo-tap'), 150);

    logoClickCount++;
    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1500);

    if (logoClickCount >= 5) {
      logoClickCount = 0;
      toggleAccess();
    }
  });
}

async function toggleAccess() {
  const snap = await db.ref('appState/open').once('value');
  await db.ref('appState/open').set(snap.val() !== true);
}

setupLogoToggle(document.getElementById('lock-logo'));
setupLogoToggle(document.getElementById('home-logo'));

db.ref('appState/open').on('value', snap => {
  if (roomId) return; // a session is already in progress, don't disrupt it
  showScreen(snap.val() === true ? 'home' : 'lock');
});

// ── Home ───────────────────────────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', createRoom);
document.getElementById('btn-join-show').addEventListener('click', () => {
  document.getElementById('join-form').classList.toggle('hidden');
});
document.getElementById('btn-join-confirm').addEventListener('click', joinRoom);
document.getElementById('room-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoom();
});
document.getElementById('btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('display-room-code').textContent);
  document.getElementById('btn-copy').textContent = '✓';
  setTimeout(() => document.getElementById('btn-copy').textContent = '⎘', 1500);
});
document.getElementById('btn-restart').addEventListener('click', () => location.reload());
document.getElementById('btn-restart2').addEventListener('click', () => location.reload());

function showError(msg) {
  const el = document.getElementById('home-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Room creation ──────────────────────────────────────────────────────────
async function createRoom() {
  const btn = document.getElementById('btn-create');
  btn.textContent = 'Chargement...';
  btn.disabled = true;

  try {
    const fetchedMovies = await fetchMovies();
    if (!fetchedMovies.length) throw new Error('Impossible de charger les films');

    roomId = generateCode();

    await db.ref(`rooms/${roomId}`).set({
      status: 'waiting',
      createdAt: Date.now(),
      movies: fetchedMovies,
      users: { [userId]: true },
    });

    movies = fetchedMovies;
    document.getElementById('display-room-code').textContent = roomId;
    showScreen('waiting');
    listenForPartner();
  } catch (err) {
    console.error(err);
    showError('Erreur : ' + err.message);
    btn.textContent = 'Créer une session';
    btn.disabled = false;
  }
}

// ── Room joining ───────────────────────────────────────────────────────────
async function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 6) { showError('Le code doit faire 6 caractères'); return; }

  const btn = document.getElementById('btn-join-confirm');
  btn.textContent = 'Connexion...';
  btn.disabled = true;

  try {
    const snap = await db.ref(`rooms/${code}`).once('value');
    const room = snap.val();
    if (!room) throw new Error('Session introuvable');
    if (room.status !== 'waiting') throw new Error('Session déjà en cours ou terminée');

    roomId = code;
    movies = room.movies;

    await db.ref(`rooms/${roomId}/users/${userId}`).set(true);
    await db.ref(`rooms/${roomId}/status`).set('swiping');
    startSwiping();
  } catch (err) {
    showError(err.message);
    btn.textContent = 'Rejoindre';
    btn.disabled = false;
  }
}

// ── Wait for partner ───────────────────────────────────────────────────────
function listenForPartner() {
  db.ref(`rooms/${roomId}/status`).on('value', snap => {
    if (snap.val() === 'swiping') startSwiping();
  });
}

// ── Swiping ────────────────────────────────────────────────────────────────
function startSwiping() {
  currentIndex = 0;
  showScreen('swipe');
  renderCards();
  listenForMatch();
  watchForMatches();
}

function renderCards() {
  const stack = document.getElementById('card-stack');
  stack.innerHTML = '';
  // Show up to 3 cards in the stack
  for (let i = Math.min(currentIndex + 2, movies.length - 1); i >= currentIndex; i--) {
    if (i < movies.length) {
      const card = buildCard(movies[i]);
      if (i === currentIndex) {
        card.classList.add('top');
        makeSwipeable(card, movies[i]);
      }
      stack.appendChild(card);
    }
  }
  document.getElementById('movie-counter').textContent =
    `${currentIndex + 1} / ${movies.length}`;
}

function buildCard(movie) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  const poster = movie.poster_path
    ? `<img src="${IMG_BASE}${movie.poster_path}" alt="${movie.title}" loading="lazy">`
    : `<div style="height:65%;background:#2a2a3e;display:flex;align-items:center;justify-content:center;font-size:4rem">🎬</div>`;
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '';
  const rating = movie.vote_average ? `<span class="rating">★ ${movie.vote_average.toFixed(1)}</span>` : '';

  card.innerHTML = `
    ${poster}
    <div class="stamp stamp-like">OUI ♥</div>
    <div class="stamp stamp-nope">NON ✕</div>
    <div class="movie-card-body">
      <div class="movie-card-title">${movie.title}</div>
      <div class="movie-card-meta">${rating}${year}</div>
      <div class="movie-card-overview">${movie.overview || 'Pas de description disponible.'}</div>
    </div>`;
  return card;
}

// ── Swipe gesture ──────────────────────────────────────────────────────────
function makeSwipeable(card, movie) {
  let startX = 0, startY = 0, curX = 0, curY = 0, dragging = false;
  const stampLike = card.querySelector('.stamp-like');
  const stampNope = card.querySelector('.stamp-nope');

  function onStart(e) {
    dragging = true;
    card.classList.add('dragging');
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
  }
  function onMove(e) {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    curX = p.clientX - startX;
    curY = p.clientY - startY;
    const rot = curX * 0.08;
    card.style.transform = `translate(${curX}px, ${curY}px) rotate(${rot}deg)`;
    const ratio = Math.abs(curX) / 80;
    if (curX > 0) {
      stampLike.style.opacity = Math.min(ratio, 1);
      stampNope.style.opacity = 0;
    } else {
      stampNope.style.opacity = Math.min(ratio, 1);
      stampLike.style.opacity = 0;
    }
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (curX > 80) {
      flyOut(card, 'right');
      recordSwipe(movie, true);
    } else if (curX < -80) {
      flyOut(card, 'left');
      recordSwipe(movie, false);
    } else {
      card.style.transition = 'transform 0.3s ease';
      card.style.transform = '';
      stampLike.style.opacity = 0;
      stampNope.style.opacity = 0;
      setTimeout(() => { card.style.transition = ''; }, 300);
    }
  }

  card.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  card.addEventListener('touchstart', onStart, { passive: true });
  card.addEventListener('touchmove', onMove, { passive: true });
  card.addEventListener('touchend', onEnd);

  document.getElementById('btn-like').onclick = () => { flyOut(card, 'right'); recordSwipe(movie, true); };
  document.getElementById('btn-nope').onclick = () => { flyOut(card, 'left'); recordSwipe(movie, false); };
}

function flyOut(card, dir) {
  card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
  card.style.transform = `translate(${dir === 'right' ? 600 : -600}px, 0) rotate(${dir === 'right' ? 30 : -30}deg)`;
  card.style.opacity = '0';
  setTimeout(() => {
    currentIndex++;
    if (matchResolved) return; // match/nomatch screen already shown, don't override it
    if (currentIndex >= movies.length) {
      showScreen('waitingMatch');
      checkBothDone();
    } else {
      renderCards();
    }
  }, 350);
}

// ── Firebase swipe recording ───────────────────────────────────────────────
async function recordSwipe(movie, liked) {
  await db.ref(`rooms/${roomId}/swipes/${movie.id}/${userId}`).set(liked);
}

// ── Match detection ────────────────────────────────────────────────────────
function listenForMatch() {
  db.ref(`rooms/${roomId}/result`).on('value', snap => {
    const result = snap.val();
    if (!result) return;
    matchResolved = true;
    db.ref(`rooms/${roomId}/swipes`).off();
    const movie = result.status === 'matched'
      ? movies.find(m => m.id === result.matchedMovieId)
      : null;
    if (movie) showMatch(movie);
    else showScreen('nomatch');
  });
}

// Live-checks every swipe (from either user) and claims the room as
// "matched" the moment both users have said "oui" to the same movie.
async function watchForMatches() {
  const usersSnap = await db.ref(`rooms/${roomId}/users`).once('value');
  const userIds = Object.keys(usersSnap.val() || {});
  if (userIds.length < 2) return;

  db.ref(`rooms/${roomId}/swipes`).on('value', snap => {
    const swipes = snap.val() || {};
    const matchedMovie = findMatch(swipes, userIds);
    if (matchedMovie) claimStatus('matched', matchedMovie);
  });
}

function findMatch(swipes, userIds) {
  for (const movie of movies) {
    const votes = swipes[movie.id] || {};
    if (votes[userIds[0]] === true && votes[userIds[1]] === true) return movie;
  }
  return null;
}

// Records the room's outcome (status + matched movie id together) so no
// listener can ever see "matched" without knowing which movie. Only the id
// (a plain number) is stored — both clients already share the same `movies`
// array and can look up the full movie from it. Guarded by a check so it's
// only written once; if both clients race, they write the same value anyway.
async function claimStatus(newStatus, matchedMovie) {
  const snap = await db.ref(`rooms/${roomId}/result`).once('value');
  if (snap.exists()) return;
  const data = matchedMovie ? { status: newStatus, matchedMovieId: matchedMovie.id } : { status: newStatus };
  await db.ref(`rooms/${roomId}/result`).set(data);
  if (newStatus === 'matched' && matchedMovie) {
    await db.ref(`matchedMovies/${matchedMovie.id}`).set(true);
  }
}

// Called when the local user reaches the end of their stack.
async function checkBothDone() {
  await db.ref(`rooms/${roomId}/done/${userId}`).set(true);

  const [doneSnap, usersSnap, swipesSnap] = await Promise.all([
    db.ref(`rooms/${roomId}/done`).once('value'),
    db.ref(`rooms/${roomId}/users`).once('value'),
    db.ref(`rooms/${roomId}/swipes`).once('value'),
  ]);

  const userIds = Object.keys(usersSnap.val() || {});
  const done = doneSnap.val() || {};
  if (userIds.length < 2 || !userIds.every(id => done[id])) return;

  const matchedMovie = findMatch(swipesSnap.val() || {}, userIds);
  await claimStatus(matchedMovie ? 'matched' : 'nomatch', matchedMovie);
}

function showMatch(movie) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '';
  document.getElementById('match-card').innerHTML = `
    <img src="${IMG_BASE}${movie.poster_path}" alt="${movie.title}">
    <div class="match-info">${movie.title} ${year ? `(${year})` : ''}</div>`;
  showScreen('match');
}

// ── TMDB ──────────────────────────────────────────────────────────────────
async function fetchMovies() {
  const matchedSnap = await db.ref('matchedMovies').once('value');
  const matchedIds = new Set(Object.keys(matchedSnap.val() || {}).map(Number));

  // Fetch 2 pages of popular movies and shuffle
  const pages = [1, 2];
  const results = await Promise.all(pages.map(p =>
    fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=fr-FR&page=${p}`)
      .then(r => r.json())
      .then(d => d.results || [])
  ));
  const all = results.flat().filter(m => m.poster_path && m.overview && !matchedIds.has(m.id));
  return shuffle(all).slice(0, MOVIES_PER_SESSION);
}

// ── Utils ─────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
