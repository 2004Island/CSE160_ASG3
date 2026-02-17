// ============================================================
//  src/main.js
//
//  WebGL initialisation, shader programs, texture loading,
//  the render loop, and all keyboard/mouse input handling.
//
//  Library chain (loaded before this file in index.html):
//    lib/webgl-utils.js  → WebGLUtils.setupWebGL()
//    lib/cuon-utils.js   → initShaders(), getWebGLContext()
//    lib/cuon-matrix.js  → Matrix4, Vector3
//
//  Our files (also loaded before this):
//    src/camera.js  src/cube.js  src/world.js
// ============================================================

'use strict';

// ── Vertex Shader ────────────────────────────────────────────
// Implements the assignment requirement:
//   gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position
var VSHADER_SOURCE = `
attribute vec4 a_Position;
attribute vec2 a_UV;

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

varying vec2 v_UV;

void main() {
  gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
  v_UV = a_UV;
}
`;

// ── Fragment Shader ──────────────────────────────────────────
// Blends a solid base colour with a texture.
// u_texColorWeight:
//   0.0 → 100% base colour  (sky box — solid blue)
//   1.0 → 100% texture      (walls, ground)
var FSHADER_SOURCE = `
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_UV;

uniform vec4  u_baseColor;
uniform float u_texColorWeight;
uniform int   u_whichTexture;    // -1=none, 0=stone, 1=brick, 2=grass

uniform sampler2D u_Sampler0;   // stone / mortar
uniform sampler2D u_Sampler1;   // red brick
uniform sampler2D u_Sampler2;   // grass / ground

void main() {
  vec4 texColor;
  if      (u_whichTexture == 0) texColor = texture2D(u_Sampler0, v_UV);
  else if (u_whichTexture == 1) texColor = texture2D(u_Sampler1, v_UV);
  else if (u_whichTexture == 2) texColor = texture2D(u_Sampler2, v_UV);
  else                          texColor = u_baseColor;

  gl_FragColor = (1.0 - u_texColorWeight) * u_baseColor
               +        u_texColorWeight  * texColor;
}
`;

// ── Globals ───────────────────────────────────────────────────
var gl;
var canvas;
var camera;
var g_locs = {};          // cached shader locations (set once)
var g_worldCubes = [];    // kept for legacy compat
var g_skyCube    = null;
var g_groundCube = null;
var g_batchStone = null;  // set by buildWorld(gl)
var g_batchBrick = null;  // set by buildWorld(gl)

var g_texLoaded  = 0;     // count up to NUM_TEXTURES before starting loop
var NUM_TEXTURES = 3;

var g_keys       = {};    // currently held keys
var g_mouseLocked = false;

// FPS tracking
var g_lastTime   = 0;
var g_frameCount = 0;
var g_fps        = 0;

// ── Entry point ───────────────────────────────────────────────
function main() {
  canvas = document.getElementById('webgl');

  // getWebGLContext is from cuon-utils.js (same as your previous project)
  gl = getWebGLContext(canvas);
  if (!gl) { console.error('WebGL not available'); return; }

  // Compile + link shaders (initShaders is also from cuon-utils.js)
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.error('Shader compile/link failed');
    return;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.98, 1.0);   // fallback sky blue

  // Cache all attribute/uniform locations once at startup
  _cacheLocations();

  // Upload cube geometry to GPU (shared by all Cube instances)
  initCubeBuffer(gl);

  // Camera setup
  camera = new Camera();
  camera.setProjection(canvas);

  // Projection matrix never changes — upload once here
  gl.uniformMatrix4fv(g_locs.u_ProjectionMatrix, false,
                      camera.projectionMatrix.elements);

  // Bind samplers to their texture units
  gl.uniform1i(g_locs.u_Sampler0, 0);
  gl.uniform1i(g_locs.u_Sampler1, 1);
  gl.uniform1i(g_locs.u_Sampler2, 2);

  // Build the initial world into batches (2 draw calls total)
  buildWorld(gl);

  // Allocate sky and ground after gl + VBO are ready
  g_skyCube            = new Cube();
  g_skyCube.color      = [0.53, 0.81, 0.98, 1.0];
  g_skyCube.textureNum = -1;
  g_skyCube.matrix.setTranslate(16, 16, 16);
  g_skyCube.matrix.scale(400, 400, 400);

  g_groundCube            = new Cube();
  g_groundCube.textureNum = 2;
  g_groundCube.matrix.setTranslate(16, -0.5, 16);
  g_groundCube.matrix.scale(32, 1, 32);

  // Sheep, enemies, gun
  initSheepShader(gl);
  initEnemies();
  initGun();
  initSounds();

  // Generate procedural textures and upload to GPU.
  // The render loop starts automatically once all 3 are ready.
  _loadTextures();

  // Keyboard + mouse input
  _setupInput();
}

// ── Cache shader locations ────────────────────────────────────
// Called once. Caching avoids calling getUniformLocation every frame.
function _cacheLocations() {
  var p = gl.program;
  g_locs.a_Position         = gl.getAttribLocation (p, 'a_Position');
  g_locs.a_UV               = gl.getAttribLocation (p, 'a_UV');
  g_locs.u_ModelMatrix      = gl.getUniformLocation(p, 'u_ModelMatrix');
  g_locs.u_ViewMatrix       = gl.getUniformLocation(p, 'u_ViewMatrix');
  g_locs.u_ProjectionMatrix = gl.getUniformLocation(p, 'u_ProjectionMatrix');
  g_locs.u_baseColor        = gl.getUniformLocation(p, 'u_baseColor');
  g_locs.u_texColorWeight   = gl.getUniformLocation(p, 'u_texColorWeight');
  g_locs.u_whichTexture     = gl.getUniformLocation(p, 'u_whichTexture');
  g_locs.u_Sampler0         = gl.getUniformLocation(p, 'u_Sampler0');
  g_locs.u_Sampler1         = gl.getUniformLocation(p, 'u_Sampler1');
  g_locs.u_Sampler2         = gl.getUniformLocation(p, 'u_Sampler2');
}

// ── Procedural textures ───────────────────────────────────────
// Drawn onto hidden <canvas> elements so no image files are needed.
// To use real images instead, replace _loadTextures() with Image() loads.
// (Images must be square, power-of-2 size: 64, 128, 256, 512...)

function _makeCanvas(size, drawFn) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  drawFn(c.getContext('2d'), size);
  return c;
}

function _loadTextures() {
  // ── Texture 0: Stone with mortar lines ──
  var stone = _makeCanvas(128, function(ctx, s) {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, s, s);
    var bw = s/4, bh = s/3;
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 3;
    for (var r = 0; r*bh < s+bh; r++) {
      var xo = (r%2)*(bw/2);
      for (var c2 = -1; c2*bw < s; c2++) ctx.strokeRect(c2*bw+xo+1, r*bh+1, bw-2, bh-2);
    }
    for (var i = 0; i < 500; i++) {
      var g = Math.floor(Math.random()*60+100);
      ctx.fillStyle = 'rgb('+g+','+g+','+g+')';
      ctx.fillRect(Math.random()*s, Math.random()*s, 2, 2);
    }
  });

  // ── Texture 1: Red brick ──
  var brick = _makeCanvas(128, function(ctx, s) {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, s, s);
    var bw = s/4, bh = s/3;
    ctx.fillStyle = '#a93226';
    for (var r = 0; r*bh < s+bh; r++) {
      var xo = (r%2)*(bw/2);
      for (var c2 = -1; c2*bw < s; c2++) ctx.fillRect(c2*bw+xo+2, r*bh+2, bw-4, bh-4);
    }
    ctx.strokeStyle = '#c8a882';
    ctx.lineWidth = 2;
    for (var r = 0; r*bh < s+bh; r++) {
      var xo = (r%2)*(bw/2);
      for (var c2 = -1; c2*bw < s; c2++) ctx.strokeRect(c2*bw+xo+1, r*bh+1, bw-2, bh-2);
    }
  });

  // ── Texture 2: Grass ground ──
  var grass = _makeCanvas(128, function(ctx, s) {
    ctx.fillStyle = '#4a7c37';
    ctx.fillRect(0, 0, s, s);
    for (var i = 0; i < 800; i++) {
      var g = Math.floor(Math.random()*40+55);
      ctx.fillStyle = 'rgb('+(g-10)+','+(g+50)+','+(g-20)+')';
      ctx.fillRect(Math.random()*s, Math.random()*s, 3, 3);
    }
  });

  _uploadTex(stone, 0);
  _uploadTex(brick, 1);
  _uploadTex(grass, 2);
}

function _uploadTex(source, unit) {
  var tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);

  g_texLoaded++;
  if (g_texLoaded === NUM_TEXTURES) {
    // All textures uploaded — safe to start rendering
    requestAnimationFrame(tick);
  }
}

// ── Input setup ───────────────────────────────────────────────
function _setupInput() {
  document.addEventListener('keydown', function(e) {
    g_keys[e.key.toLowerCase()] = true;
    e.preventDefault();  // stop space/arrows scrolling the page
  });
  document.addEventListener('keyup', function(e) {
    g_keys[e.key.toLowerCase()] = false;
  });

  // Click canvas to request pointer lock
  canvas.addEventListener('click', function() {
    canvas.requestPointerLock();
  });

  // Pointer lock state change — update hint text
  document.addEventListener('pointerlockchange', function() {
    var locked = document.pointerLockElement === canvas;
    var hintEl = document.getElementById('hint');
    if (hintEl) hintEl.textContent = locked
      ? 'Mouse locked — ESC to unlock | Click to shoot'
      : 'Click canvas to lock mouse';
  });

  // Shoot on left-click only when pointer is locked
  document.addEventListener('mousedown', function(e) {
    if (e.button === 0 && document.pointerLockElement === canvas) {
      shoot(camera);
      playSound('shoot');
    }
  });

  // Mouse look — apply directly to camera angles each event.
  // yaw/pitch are plain numbers; no GL calls happen here.
  // updateView() runs once per rAF frame and reads the final angles.
  document.addEventListener('mousemove', function(e) {
    if (document.pointerLockElement !== canvas) return;
    camera.mouseRotate(e.movementX, e.movementY);
  });
}

// ── Per-frame key handling ────────────────────────────────────
function _handleKeys() {
  if (g_keys['w']) camera.moveForward();
  if (g_keys['s']) camera.moveBackwards();
  if (g_keys['a']) camera.moveLeft();
  if (g_keys['d']) camera.moveRight();
  if (g_keys['q']) camera.panLeft();
  if (g_keys['e']) camera.panRight();

  // Space = jump
  if (g_keys[' ']) {
    camera.jump();
    playSound('jump');
    g_keys[' '] = false;
  }

  // F = shoot
  if (g_keys['f']) {
    shoot(camera);
    playSound('shoot');
    g_keys['f'] = false;
  }

  // T = add block in front
  if (g_keys['t']) {
    var fp = camera.getFrontMapPosition();
    if (addBlock(fp.col, fp.row)) {
      rebuildBatches(gl);
      playSound('place');
    }
    g_keys['t'] = false;
  }

  // Y = remove block in front
  if (g_keys['y']) {
    var fp = camera.getFrontMapPosition();
    if (removeBlock(fp.col, fp.row)) {
      rebuildBatches(gl);
      playSound('break');
    }
    g_keys['y'] = false;
  }
}

// ── Tick ──────────────────────────────────────────────────────
// Called every animation frame via requestAnimationFrame.
function tick(timestamp) {
  // FPS — update display every 500ms
  g_frameCount++;
  if (g_lastTime === 0) g_lastTime = timestamp;
  var elapsed = timestamp - g_lastTime;
  if (elapsed >= 500) {
    g_fps        = Math.round(g_frameCount / (elapsed / 1000));
    g_frameCount = 0;
    g_lastTime   = timestamp;
    var fpsEl = document.getElementById('fps');
    if (fpsEl) fpsEl.textContent = g_fps;
  }

  var _eyeBefore = [camera.eye[0], camera.eye[2]];
  _handleKeys();
  var _moving = (camera.eye[0] !== _eyeBefore[0] || camera.eye[2] !== _eyeBefore[1]);
  tickWalkSound(_moving && camera.grounded);
  camera.applyGravity();   // physics tick
  updateBullets();
  updateEnemies(camera);
  setBullets(checkBulletHits(getBullets()));
  renderScene();
  _updateHUD();

  requestAnimationFrame(tick);
}

// ── HUD update ────────────────────────────────────────────────
function _updateHUD() {
  var e  = camera.eye;
  var fp = camera.getFrontMapPosition();

  var posEl    = document.getElementById('pos');
  var frontEl  = document.getElementById('front');
  var heightEl = document.getElementById('height');
  var healthEl = document.getElementById('health');
  var scoreEl  = document.getElementById('score');

  if (posEl)    posEl.textContent    = e[0].toFixed(1) + ', ' + e[1].toFixed(1) + ', ' + e[2].toFixed(1);
  if (frontEl)  frontEl.textContent  = fp.col + ', ' + fp.row;
  if (heightEl) heightEl.textContent = getBlockHeight(fp.col, fp.row);
  if (healthEl) healthEl.textContent = Math.max(0, Math.ceil(g_playerHealth));
  if (scoreEl)  scoreEl.textContent  = g_score;
}

// ── Render scene ──────────────────────────────────────────────
// All drawing happens here. Called once per frame from tick().
function renderScene() {
  // Always restore world shader at start of frame — sheep pass may have left
  // gl.program dirty if it ran last frame
  gl.useProgram(gl.program);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Recompute view matrix ONCE per frame here, not in input handlers
  camera.updateView();

  gl.uniformMatrix4fv(g_locs.u_ViewMatrix, false,
                      camera.viewMatrix.elements);

  // ─── Sky box (pre-allocated, depth mask off) ───
  gl.depthMask(false);
  g_skyCube.render(gl, g_locs);
  gl.depthMask(true);

  // ─── Ground (pre-allocated, 1 draw call) ───
  g_groundCube.render(gl, g_locs);

  // ─── Walls (batched: 2 draw calls for all 700+ cubes) ───
  if (g_batchStone) g_batchStone.draw(gl, g_locs);
  if (g_batchBrick) g_batchBrick.draw(gl, g_locs);

  // ─── Sheep, enemies, bullets ─────────────────────────────────
  // ONE useProgram + ONE view/proj upload for the entire pass.
  beginSheepPass(gl, camera);
  drawSheep(gl);       // no program switch, no matrix alloc
  drawEnemies(gl);     // no program switch, no matrix alloc
  drawBullets(gl);     // no program switch, no matrix alloc

  // Restore world shader for next frame
  gl.useProgram(gl.program);
}

// ── Start ─────────────────────────────────────────────────────
window.onload = main;