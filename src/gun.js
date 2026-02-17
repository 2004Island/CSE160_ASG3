// ============================================================
//  src/gun.js — zero per-frame Matrix4 allocations
//
//  beginSheepPass() must be called before drawBullets().
// ============================================================

'use strict';

var g_bullets       = [];
var g_shootCooldown = 0;
var BULLET_SPEED    = 0.5;
var BULLET_LIFE     = 80;
var SHOOT_COOLDOWN  = 12;

// Pre-allocated scratch
var _bMat          = new Matrix4();
var _bColorYellow  = new Float32Array([1.0, 0.9, 0.1]);

function initGun() { g_bullets = []; g_shootCooldown = 0; }

function shoot(camera) {
  if (g_shootCooldown > 0) return;
  g_shootCooldown = SHOOT_COOLDOWN;

  var yawR   = camera.yaw   * Math.PI / 180;
  var pitchR = camera.pitch * Math.PI / 180;
  var cp     = Math.cos(pitchR);

  var dx = Math.cos(yawR)*cp, dy = Math.sin(pitchR), dz = Math.sin(yawR)*cp;

  g_bullets.push({
    x: camera.eye[0]+dx*0.5, y: camera.eye[1]+dy*0.5, z: camera.eye[2]+dz*0.5,
    dx: dx*BULLET_SPEED, dy: dy*BULLET_SPEED, dz: dz*BULLET_SPEED,
    life: BULLET_LIFE
  });
}

function updateBullets() {
  if (g_shootCooldown > 0) g_shootCooldown--;
  for (var i = 0; i < g_bullets.length; i++) {
    var b = g_bullets[i];
    b.x += b.dx; b.y += b.dy; b.z += b.dz; b.life--;
  }
  g_bullets = g_bullets.filter(function(b) { return b.life > 0; });
}

function drawBullets(gl) {
  if (!g_sheepProgram || g_bullets.length === 0) return;

  // Brighter ambient just for bullets so they're easy to see
  gl.uniform3f(g_sl.u_Ambient, 0.8, 0.8, 0.0);

  for (var i = 0; i < g_bullets.length; i++) {
    var b = g_bullets[i];
    _bMat.setTranslate(b.x, b.y, b.z);
    _bMat.scale(0.12, 0.12, 0.12);
    _ss(gl, _bMat, _bColorYellow, g_sheepCubeData);
  }

  // Restore normal ambient for anything drawn after
  gl.uniform3f(g_sl.u_Ambient, 0.35, 0.35, 0.35);
}

function getBullets()    { return g_bullets; }
function setBullets(arr) { g_bullets = arr; }