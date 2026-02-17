// ============================================================
//  src/sound.js
//
//  Put your audio files in a sounds/ folder next to index.html:
//
//    sounds/walk.mp3        — grass footstep, short loop (~0.5s)
//    sounds/place.mp3       — block place thud (~0.3s)
//    sounds/shoot.mp3       — gun fire crack (~0.2s)
//    sounds/enemy_die.mp3   — enemy death pop/splat (~0.4s)
//
//  MP3 is safest for cross-browser. OGG also works — just change
//  the extensions below.
// ============================================================

var _sfx = {};

function initSounds() {
  var defs = {
    walk:      'sounds/walk.mp3',
    place:     'sounds/place.mp3',
    break:     'sounds/break.mp3',
    shoot:     'sounds/shoot.mp3',
    jump:      'sounds/jump.mp3',
    enemy_die: 'sounds/enemy_die.mp3'
  };
  for (var name in defs) {
    var a = new Audio(defs[name]);
    a.preload = 'auto';
    a.volume  = (name === 'walk') ? 0.35 : 0.65;
    a.loop    = (name === 'walk');
    _sfx[name] = a;
  }
}

// Fire a one-shot sound from the beginning
function playSound(name) {
  var a = _sfx[name];
  if (!a) return;
  a.currentTime = 0;
  a.play().catch(function(){});
}

// Walk loop — call each frame the player is moving
var _walkActive = false;
function tickWalkSound(moving) {
  var a = _sfx['walk'];
  if (!a) return;
  if (moving && !_walkActive) {
    _walkActive = true;
    a.currentTime = 0;
    a.play().catch(function(){});
  } else if (!moving && _walkActive) {
    _walkActive = false;
    a.pause();
    a.currentTime = 0;
  }
}