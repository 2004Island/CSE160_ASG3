// ============================================================
//  src/enemies.js
// ============================================================
'use strict';

var g_enemies        = [];
var ENEMY_SPEED      = 0.02;
var ENEMY_SPAWN_RATE = 180;
var ENEMY_MAX        = 20;
var g_enemySpawnTimer = 0;
var ENEMY_DAMAGE_DIST = 1.2;

var g_playerHealth = 100;
var g_score        = 0;

// Pre-allocated scratch matrices — 1 base + 6 face features = 7
var _eBase = new Matrix4();
var _eFace = [];
(function(){ for(var i=0;i<8;i++) _eFace.push(new Matrix4()); })();

// Pre-allocated colours
var _eRed    = new Float32Array([0.85, 0.12, 0.12]);
var _eOrange = new Float32Array([0.9,  0.45, 0.1 ]);
var _eDark   = new Float32Array([0.06, 0.04, 0.04]);
var _eWhite  = new Float32Array([0.95, 0.92, 0.88]);

function initEnemies() {
  g_enemies      = [];
  g_playerHealth = 100;
  g_score        = 0;
  spawnEnemy();
}

function spawnEnemy() {
  var edge = Math.floor(Math.random() * 4);
  var x, z;
  if      (edge === 0) { x = 1  + Math.random()*30; z = 1;  }
  else if (edge === 1) { x = 1  + Math.random()*30; z = 30; }
  else if (edge === 2) { x = 1;  z = 1 + Math.random()*30; }
  else                 { x = 30; z = 1 + Math.random()*30; }
  g_enemies.push({ x:x, y:0.5, z:z, health:2, scale:0.6,
                   bobTime:Math.random()*Math.PI*2, dead:false });
}

function updateEnemies(camera) {
  var px = camera.eye[0], pz = camera.eye[2];
  g_enemySpawnTimer++;
  if (g_enemySpawnTimer >= ENEMY_SPAWN_RATE) {
    g_enemySpawnTimer = 0;
    if (g_enemies.length < ENEMY_MAX) spawnEnemy();
  }
  for (var i = 0; i < g_enemies.length; i++) {
    var e = g_enemies[i];
    if (e.dead) continue;
    var dx = px - e.x, dz = pz - e.z;
    var dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > 0.01) { e.x += (dx/dist)*ENEMY_SPEED; e.z += (dz/dist)*ENEMY_SPEED; }
    e.bobTime += 0.08;
    e.y = 0.5 + Math.abs(Math.sin(e.bobTime)) * 0.15;
    if (dist < ENEMY_DAMAGE_DIST) {
      g_playerHealth -= 0.15;
      if (g_playerHealth < 0) g_playerHealth = 0;
    }
  }
  g_enemies = g_enemies.filter(function(e){ return !e.dead; });
}

function drawEnemies(gl) {
  if (!g_sheepProgram) return;

  for (var i = 0; i < g_enemies.length; i++) {
    var e = g_enemies[i];
    if (e.dead) continue;

    var sc = e.scale;
    var bodyColor = e.health > 1 ? _eRed : _eOrange;
    var spin = e.bobTime * 30;

    // ── Body cube ──
    _eBase.setTranslate(e.x, e.y, e.z);
    _eBase.rotate(spin, 0, 1, 0);

    _eFace[0].set(_eBase); _eFace[0].scale(sc, sc, sc);
    _ss(gl, _eFace[0], bodyColor, g_sheepCubeData);

    // ── Face features on front face (local +Z) ──
    // All offsets are in local space before spin, so face always faces camera-ish
    var f = sc;   // shorthand for scale factor

    // Left eye
    _eFace[1].set(_eBase);
    _eFace[1].translate(-f*0.22, f*0.15, f*0.52);
    _eFace[1].scale(f*0.14, f*0.14, f*0.06);
    _ss(gl, _eFace[1], _eDark, g_sheepCubeData);

    // Right eye
    _eFace[2].set(_eBase);
    _eFace[2].translate( f*0.22, f*0.15, f*0.52);
    _eFace[2].scale(f*0.14, f*0.14, f*0.06);
    _ss(gl, _eFace[2], _eDark, g_sheepCubeData);

    // Left angry brow (tilted inward)
    _eFace[3].set(_eBase);
    _eFace[3].translate(-f*0.22, f*0.38, f*0.52);
    _eFace[3].rotate(-25, 0, 0, 1);
    _eFace[3].scale(f*0.22, f*0.07, f*0.06);
    _ss(gl, _eFace[3], _eDark, g_sheepCubeData);

    // Right angry brow (tilted inward)
    _eFace[4].set(_eBase);
    _eFace[4].translate( f*0.22, f*0.38, f*0.52);
    _eFace[4].rotate( 25, 0, 0, 1);
    _eFace[4].scale(f*0.22, f*0.07, f*0.06);
    _ss(gl, _eFace[4], _eDark, g_sheepCubeData);

    // Mouth (angry frown — two segments)
    _eFace[5].set(_eBase);
    _eFace[5].translate(-f*0.14, -f*0.22, f*0.52);
    _eFace[5].rotate( 18, 0, 0, 1);
    _eFace[5].scale(f*0.18, f*0.07, f*0.06);
    _ss(gl, _eFace[5], _eDark, g_sheepCubeData);

    _eFace[6].set(_eBase);
    _eFace[6].translate( f*0.14, -f*0.22, f*0.52);
    _eFace[6].rotate(-18, 0, 0, 1);
    _eFace[6].scale(f*0.18, f*0.07, f*0.06);
    _ss(gl, _eFace[6], _eDark, g_sheepCubeData);
  }
}

function checkBulletHits(bullets) {
  var surviving = [];
  for (var b = 0; b < bullets.length; b++) {
    var bullet = bullets[b], hit = false;
    for (var e = 0; e < g_enemies.length; e++) {
      var en = g_enemies[e];
      if (en.dead) continue;
      var dx=bullet.x-en.x, dz=bullet.z-en.z, dy=bullet.y-en.y;
      if (Math.sqrt(dx*dx+dy*dy+dz*dz) < en.scale+0.3) {
        en.health--;
        if (en.health <= 0) {
          en.dead = true;
          g_score += 10;
          playSound('enemy_die');
        }
        hit = true; break;
      }
    }
    if (!hit) surviving.push(bullet);
  }
  return surviving;
}