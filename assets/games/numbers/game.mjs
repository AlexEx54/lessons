import { levels, numberWords, formatNumber } from './levels.mjs';

const $ = id => document.getElementById(id);
const stage = $('stage');
const fox = $('fox');
const home = $('home-island');
const choices = $('choices');
const dialog = $('dialog');
const audio = new Audio();
const narrow = matchMedia('(max-width: 590px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const levelButtons = [];
const progressKey = 'easyclass.salta-numeros.completed.v1';
let passed = [];
try {
  const saved = JSON.parse(localStorage.getItem(progressKey));
  if (Array.isArray(saved)) passed = saved.filter(i => Number.isInteger(i) && i >= 0 && i < levels.length);
} catch { /* Progress is optional when browser storage is unavailable. */ }

let levelIndex = 0;
let phase = 'menu';
let deck = [];
let islands = [];
let score = 0;
let lives = 3;
let captions = false;
let audioUnavailable = false;
let paused = false;
let remaining = 0;
let deadline = 0;
let timerFrame = 0;
let playSerial = 0;
let audioWatchdog = 0;
const roundTime = () => (levelIndex < 4 ? 15 : 18) * 1000;
const target = () => deck[score];
// The fox takes off from the home island; its feet stand on the island's top edge.
const homeSpot = [5, 67];

function shuffled(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function refreshHud() {
  const level = levels[levelIndex];
  $('level-label').textContent = 'Level ' + String(levelIndex + 1).padStart(2, '0');
  $('level-name').textContent = level.name;
  $('score').textContent = score + '/' + level.values.length;
  $('hearts').setAttribute('aria-label', 'Lives left: ' + lives);
  $('hearts').innerHTML = Array.from({length: 3}, (_, i) =>
    '<svg aria-hidden="true" class="heart' + (i >= lives ? ' lost' : '') + '"><use href="#i-heart"/></svg>').join('');
  levelButtons.forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === levelIndex));
    button.classList.toggle('passed', passed.includes(i));
    button.disabled = phase === 'playing' || phase === 'resolving';
  });
}

function setPhase(value) {
  phase = value;
  stage.dataset.view = value;
  $('splash').hidden = value !== 'menu';
  $('prompt').hidden = value !== 'playing';
  $('pause').hidden = value !== 'playing';
  $('timer').hidden = value !== 'playing';
  $('result').hidden = value !== 'result';
  $('feedback').hidden = true;
  refreshHud();
}

function putAt(element, x, y) {
  element.style.setProperty('--x', x + '%');
  element.style.setProperty('--y', y + '%');
}

function positions() {
  if (phase === 'menu') {
    return narrow.matches ? [[37,84], [62,75], [87,66]] : [[54,73], [72,61], [89,49]];
  }
  return [[27,69], [54,59], [82,50]];
}

function layout() {
  const points = positions();
  islands.forEach((button, i) => putAt(button, ...points[i]));
  putAt(fox, ...(phase === 'menu' ? points[0] : homeSpot));
}

function makeIslands(numbers, preview) {
  return numbers.map((n, i) => {
    const button = document.createElement('button');
    button.className = 'island choice';
    button.disabled = preview;
    if (preview) button.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-label', 'Island ' + (i + 1) + ', number ' + formatNumber(n));
    const label = document.createElement('span');
    label.className = 'number';
    label.lang = 'es';
    // The fox occupies the first island on the title screen.
    label.textContent = preview && i === 0 ? '' : formatNumber(n);
    const key = document.createElement('span');
    key.className = 'hotkey';
    key.textContent = i + 1;
    button.append(label, key);
    button.addEventListener('click', () => answer(i, n));
    return button;
  });
}

// Replaces the whole scene at once: used when a level starts and when motion is reduced.
function setIslands(numbers, preview) {
  [fox, home].forEach(el => el.getAnimations().forEach(animation => animation.cancel()));
  islands = makeIslands(numbers, preview);
  choices.replaceChildren(...islands);
  layout();
}

function roundNumbers() {
  const number = target();
  const others = shuffled(levels[levelIndex].values.filter(value => value !== number));
  return shuffled([number, ...others.slice(0, 2)]);
}

function stopSound() {
  playSerial++;
  clearTimeout(audioWatchdog);
  audio.pause();
}

function updateCaption() {
  $('caption').hidden = !captions && !audioUnavailable;
  $('caption').textContent = phase === 'playing' ? numberWords(target()) : '';
  $('words').setAttribute('aria-pressed', String(captions));
}

function playNumber() {
  if (phase !== 'playing' || paused) return;
  const serial = ++playSerial;
  const promptReady = unavailable => {
    if (serial !== playSerial) return;
    clearTimeout(audioWatchdog);
    audioUnavailable = unavailable;
    updateCaption();
    if (!deadline) {
      deadline = performance.now() + remaining;
      tick();
    }
  };
  clearTimeout(audioWatchdog);
  audioWatchdog = setTimeout(() => promptReady(true), 3500);
  audio.currentTime = 0;
  audio.play().then(() => promptReady(false), () => promptReady(true));
}

function showMenu(index) {
  stopSound();
  cancelAnimationFrame(timerFrame);
  levelIndex = index;
  score = 0;
  lives = 3;
  paused = false;
  setPhase('menu');
  const values = levels[index].values;
  setIslands([values[0], values[4], values[7]], true);
}

function tick() {
  if (paused || phase !== 'playing') return;
  remaining = Math.max(0, deadline - performance.now());
  $('timer').firstElementChild.style.transform = 'scaleX(' + remaining / roundTime() + ')';
  if (remaining === 0) answer(-1, null);
  else timerFrame = requestAnimationFrame(tick);
}

// Starts the round on the islands already on stage.
function beginRound() {
  setPhase('playing');
  audioUnavailable = false;
  audio.src = '/assets/games/numbers/audio/' + target() + '.mp3';
  updateCaption();
  remaining = roundTime();
  deadline = 0;
  $('timer').firstElementChild.style.transform = 'scaleX(1)';
  if (document.hidden) openDialog('pause');
  else playNumber();
}

function start() {
  deck = shuffled(levels[levelIndex].values);
  score = 0;
  lives = 3;
  paused = false;
  setPhase('playing');
  setIslands(roundNumbers(), false);
  beginRound();
  if (!paused) $('listen').focus({preventScroll:true});
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Animation offsets are in stage percent, so the motion matches the layout on any screen size.
const shift = (x, y) => (stage.clientWidth * x / 100) + 'px ' + (stage.clientHeight * y / 100) + 'px';
const run = (el, keyframes, options) => el.animate(keyframes, {fill:'both', ...options}).finished;

async function hop(index) {
  const [x, y] = positions()[index];
  const [homeX, homeY] = homeSpot;
  await run(fox, [
    {left:homeX + '%', top:homeY + '%'},
    {left:(homeX + x) / 2 + '%', top:(Math.min(homeY, y) - 26) + '%', offset:.48},
    {left:x + '%', top:y + '%'},
  ], {duration:520, easing:'ease-in-out'});
  putAt(fox, x, y);
  fox.getAnimations().forEach(animation => animation.cancel());
}

// The island under the fox trembles and drops out of the stage, carrying the fox with it.
async function fall(island) {
  const riders = [island, fox];
  // Hard steps between the shake frames keep the pixel-art look.
  const shake = ['0 0', '-3px 0', '3px 1px', '-2px 1px', '2px 2px', '0 2px'].map(translate => ({translate, easing:'steps(1)'}));
  await Promise.all(riders.map(el => run(el, shake, {duration:300})));
  // Both pivot around the fox's feet (see transform-origin in game.css), so they tilt as one piece.
  await Promise.all(riders.map(el => run(el, [
    {translate:'0 2px', rotate:'0deg'}, {translate:shift(0, 105), rotate:'14deg'},
  ], {duration:640, easing:'cubic-bezier(.5, 0, .9, .45)'})));
}

// Moves the scene on to the next round's islands.
// landed: the island the fox stands on, which becomes the new home island.
// fallen: the island that fell with the fox; the fox comes back on the home island.
async function changeIslands(landed, fallen) {
  const old = islands;
  const points = positions();
  islands = makeIslands(roundNumbers(), false);
  islands.forEach((button, i) => putAt(button, ...points[i]));
  choices.append(...islands);
  const motions = old.filter(button => button !== landed && button !== fallen).map(button =>
    run(button, [{opacity:1}, {opacity:0}], {duration:260}));
  if (landed) {
    // Scroll the world so the landed island takes the home island's place.
    const [x, y] = points[old.indexOf(landed)];
    const offset = shift(homeSpot[0] - x, homeSpot[1] - y);
    motions.push(run(landed.querySelector('.number'), [{opacity:1}, {opacity:0}], {duration:220}));
    motions.push(...[fox, home, landed].map(el => run(el, [{translate:'0 0'}, {translate:offset}], {duration:460, easing:'ease-in-out'})));
  } else {
    [fox, home].forEach(el => el.getAnimations().forEach(animation => animation.cancel()));
    putAt(fox, ...homeSpot);
    if (fallen === home) {
      // A new home island floats up from below with the fox on it.
      motions.push(...[fox, home].map(el => run(el, [
        {translate:shift(0, 40), opacity:0}, {translate:'0 0', opacity:1},
      ], {duration:520, easing:'cubic-bezier(.2, .8, .3, 1)'})));
    } else {
      // The fox drops back onto the home island with a small bounce.
      motions.push(run(fox, [
        {translate:shift(0, -70), opacity:0},
        {translate:'0 0', opacity:1, offset:.72, easing:'ease-out'},
        {translate:'0 -6px', offset:.86, easing:'ease-in'},
        {translate:'0 0'},
      ], {duration:560, easing:'ease-in'}));
    }
  }
  motions.push(...islands.map((button, i) => run(button, [
    {translate:shift(8, 0), opacity:0}, {translate:'0 0', opacity:1},
  ], {duration:420, delay:230 + i * 80, easing:'cubic-bezier(.2, .8, .3, 1)'})));
  await Promise.all(motions);
  old.forEach(button => button.remove());
  [fox, home, ...islands].forEach(el => el.getAnimations().forEach(animation => animation.cancel()));
  putAt(fox, ...homeSpot);
}

async function answer(index, number) {
  if (phase !== 'playing' || paused) return;
  cancelAnimationFrame(timerFrame);
  stopSound();
  const was = target();
  const correct = number === was;
  if (correct) score++;
  else lives--;
  setPhase('resolving');
  islands.forEach(button => { button.disabled = true; });
  const island = index < 0 ? home : islands[index];
  if (index >= 0) island.classList.add(correct ? 'correct' : 'wrong');
  $('feedback').textContent = correct ? 'Correct!' : (index < 0 ? 'Time’s up. ' : '') + numberWords(was) + ' — ' + formatNumber(was);
  $('feedback').hidden = false;
  const motion = !reducedMotion.matches;
  if (motion && index >= 0) await hop(index);
  if (motion && !correct) await fall(island);
  if (!motion) await delay(900);
  if (lives === 0 || score === deck.length) {
    showResult();
    return;
  }
  // Bring a missed number back later so the whole set gets practised.
  if (!correct) deck.push(...deck.splice(score, 1));
  if (motion) await changeIslands(correct ? island : null, correct ? null : island);
  else setIslands(roundNumbers(), false);
  beginRound();
}

function showResult() {
  const won = score === deck.length;
  if (won && !passed.includes(levelIndex)) {
    passed.push(levelIndex);
    try { localStorage.setItem(progressKey, JSON.stringify(passed)); } catch { /* Optional progress. */ }
  }
  setPhase('result');
  $('result-title').textContent = won ? 'Level complete!' : 'Out of lives';
  $('result-summary').textContent = 'Level ' + (levelIndex + 1) + ' · Correct jumps: ' + score + ' of ' + deck.length;
  $('again').textContent = won && levelIndex < levels.length - 1 ? 'Next level' : 'Play again';
  $('again').focus({preventScroll:true});
}

function openDialog(kind) {
  if (phase === 'resolving' || dialog.open) return;
  paused = phase === 'playing';
  if (paused) {
    cancelAnimationFrame(timerFrame);
    if (deadline) remaining = Math.max(0, deadline - performance.now());
    deadline = 0;
    stopSound();
  }
  $('dialog-title').textContent = kind === 'help' ? 'How to play' : 'Paused';
  $('dialog-text').textContent = kind === 'help' ? 'Listen to a number in Spanish and tap the island with that number before the time bar runs out. You can also use keys 1, 2 and 3; Space replays the number. Make 10 correct jumps to pass a level. The fox has three lives.' : 'The timer is stopped. Carry on with the same number when you’re ready.';
  $('dismiss').textContent = paused ? 'Resume game' : 'Got it';
  $('quit').hidden = !paused;
  dialog.showModal();
}

function resume() {
  if (!paused) return;
  paused = false;
  playNumber();
}

dialog.addEventListener('close', resume);

levels.forEach((level, index) => {
  const button = document.createElement('button');
  button.className = 'level-tile';
  const number = document.createElement('span');
  number.className = 'level-number';
  number.textContent = String(index + 1).padStart(2, '0');
  const range = document.createElement('span');
  range.className = 'level-range';
  range.textContent = level.range;
  button.append(number, range);
  button.title = 'Level ' + (index + 1) + ' · ' + level.name;
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => showMenu(index));
  levelButtons.push(button);
  $(index < 4 ? 'basic' : 'advanced').append(button);
});
$('start').addEventListener('click', start);
$('again').addEventListener('click', () => {
  if (score === deck.length && levelIndex < levels.length - 1) levelIndex++;
  start();
});
$('to-menu').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  showMenu(levelIndex);
  levelButtons[levelIndex].focus();
});
$('listen').addEventListener('click', playNumber);
$('words').addEventListener('click', () => { captions = !captions; updateCaption(); });
$('help').addEventListener('click', () => openDialog('help'));
$('pause').addEventListener('click', () => openDialog('pause'));
$('dismiss').addEventListener('click', () => {
  dialog.close();
  resume();
});
$('quit').addEventListener('click', () => { showMenu(levelIndex); dialog.close(); $('start').focus(); });
if (document.fullscreenEnabled) {
  $('fullscreen').hidden = false;
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('console').requestFullscreen();
    } catch { /* Fullscreen can be denied by an embedding page. */ }
  });
  document.addEventListener('fullscreenchange', () => {
    const title = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    $('fullscreen').title = title;
    $('fullscreen').setAttribute('aria-label', title);
  });
}
document.addEventListener('keydown', event => {
  if (phase !== 'playing' || paused || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (['1','2','3'].includes(event.key)) {
    event.preventDefault();
    islands[Number(event.key) - 1].click();
  } else if (event.code === 'Space' && (event.target.tagName !== 'BUTTON' || event.target === $('listen'))) {
    event.preventDefault();
    playNumber();
  } else if (event.key === 'Escape') {
    openDialog('pause');
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'playing') openDialog('pause');
});
narrow.addEventListener('change', () => { if (phase !== 'resolving') layout(); });
showMenu(0);
