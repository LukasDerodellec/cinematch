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
    if (snap.val() === 'matched') loadMatchFromDB();
    if (snap.val() === 'nomatch') showScreen('nomatch');
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
  db.ref(`rooms/${roomId}/status`).on('value', snap => {
    const s = snap.val();
    if (s === 'matched') {
      matchResolved = true;
      db.ref(`rooms/${roomId}/swipes`).off();
      loadMatchFromDB();
    }
    if (s === 'nomatch') {
      matchResolved = true;
      db.ref(`rooms/${roomId}/swipes`).off();
      showScreen('nomatch');
    }
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

// Atomically moves the room out of "swiping", avoiding both users
// writing the result at the same time.
async function claimStatus(newStatus, matchedMovie) {
  const result = await db.ref(`rooms/${roomId}/status`).transaction(current =>
    current === 'swiping' ? newStatus : undefined
  );
  if (result.committed && matchedMovie) {
    await db.ref(`rooms/${roomId}/matchedMovie`).set(matchedMovie);
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

async function loadMatchFromDB() {
  const snap = await db.ref(`rooms/${roomId}/matchedMovie`).once('value');
  const movie = snap.val();
  if (!movie) return;

  const year = movie.release_date ? movie.release_date.slice(0, 4) : '';
  document.getElementById('match-card').innerHTML = `
    <img src="${IMG_BASE}${movie.poster_path}" alt="${movie.title}">
    <div class="match-info">${movie.title} ${year ? `(${year})` : ''}</div>`;
  showScreen('match');
}

// ── TMDB ──────────────────────────────────────────────────────────────────
async function fetchMovies() {
  // Fetch 2 pages of popular movies and shuffle
  const pages = [1, 2];
  const results = await Promise.all(pages.map(p =>
    fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=fr-FR&page=${p}`)
      .then(r => r.json())
      .then(d => d.results || [])
  ));
  const all = results.flat().filter(m => m.poster_path && m.overview);
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
