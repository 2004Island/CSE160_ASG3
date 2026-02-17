// ============================================================
//  src/sheep.js  — exact original body proportions restored
//  Zero per-frame allocations, single shader pass.
// ============================================================
'use strict';

var SHEEP_VSHADER = `
attribute vec4 a_Position;
attribute vec3 a_Normal;
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;
varying vec3 v_Normal;
varying vec3 v_Position;
void main() {
  gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
  v_Position  = vec3(u_ModelMatrix * a_Position);
  v_Normal    = normalize(mat3(u_ModelMatrix) * a_Normal);
}`;

var SHEEP_FSHADER = `
precision mediump float;
uniform vec3 u_Color;
uniform vec3 u_LightPos;
uniform vec3 u_Ambient;
varying vec3 v_Normal;
varying vec3 v_Position;
void main() {
  vec3  n    = normalize(v_Normal);
  vec3  l    = normalize(u_LightPos - v_Position);
  float diff = max(dot(n, l), 0.0);
  gl_FragColor = vec4(u_Ambient * u_Color + diff * u_Color, 1.0);
}`;

var g_sheepProgram  = null;
var g_sheepSphere   = {};
var g_sheepCylinder = {};
var g_sheepCubeData = {};
var g_sl            = {};

// Pre-allocated matrix pool — enough for all parts (body+head+eyes×2+ears×2+tail+arms×8+legs×8 = 24)
var _mBase = new Matrix4();
var _mPool = [];
(function() { for (var i = 0; i < 28; i++) _mPool.push(new Matrix4()); })();

// Pre-allocated colours
var SC = {
  white:    new Float32Array([0.95, 0.95, 0.92]),
  darkGray: new Float32Array([0.22, 0.22, 0.22]),
  black:    new Float32Array([0.08, 0.08, 0.08])
};

// Animation state — mirrors original variable names
var g_sheepTime        = 0;
var g_tailAngle        = 0;
var g_rightArmShoulder = 0;
var g_rightArmElbow    = 0;
var g_leftArmShoulder  = 0;
var g_leftArmElbow     = 0;
var g_rightLegHip      = 0;
var g_rightLegKnee     = 0;
var g_leftLegHip       = 0;
var g_leftLegKnee      = 0;

var SHEEP_X = 8, SHEEP_Z = 8;

// ── Init ─────────────────────────────────────────────────────
function initSheepShader(gl) {
  g_sheepProgram = createProgram(gl, SHEEP_VSHADER, SHEEP_FSHADER);
  if (!g_sheepProgram) { console.error('Sheep shader failed'); return; }

  g_sl.a_Position         = gl.getAttribLocation (g_sheepProgram, 'a_Position');
  g_sl.a_Normal           = gl.getAttribLocation (g_sheepProgram, 'a_Normal');
  g_sl.u_ModelMatrix      = gl.getUniformLocation(g_sheepProgram, 'u_ModelMatrix');
  g_sl.u_ViewMatrix       = gl.getUniformLocation(g_sheepProgram, 'u_ViewMatrix');
  g_sl.u_ProjectionMatrix = gl.getUniformLocation(g_sheepProgram, 'u_ProjectionMatrix');
  g_sl.u_Color            = gl.getUniformLocation(g_sheepProgram, 'u_Color');
  g_sl.u_LightPos         = gl.getUniformLocation(g_sheepProgram, 'u_LightPos');
  g_sl.u_Ambient          = gl.getUniformLocation(g_sheepProgram, 'u_Ambient');

  _initSheepSphere(gl);
  _initSheepCylinder(gl);
  _initSheepCube(gl);

  gl.useProgram(g_sheepProgram);
  gl.enableVertexAttribArray(g_sl.a_Position);
  gl.enableVertexAttribArray(g_sl.a_Normal);
}

// Called once per frame BEFORE drawSheep/drawEnemies/drawBullets
function beginSheepPass(gl, camera) {
  if (!g_sheepProgram) return;
  gl.useProgram(g_sheepProgram);
  gl.uniformMatrix4fv(g_sl.u_ViewMatrix,        false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(g_sl.u_ProjectionMatrix,  false, camera.projectionMatrix.elements);
  gl.uniform3f(g_sl.u_LightPos, 16, 20, 16);
  gl.uniform3f(g_sl.u_Ambient,  0.35, 0.35, 0.35);
}

// ── Draw ─────────────────────────────────────────────────────
function drawSheep(gl) {
  if (!g_sheepProgram) return;

  // Tick animation
  g_sheepTime += 0.04;
  g_tailAngle          = Math.sin(g_sheepTime * 2.5) * 20;
  var walk             = Math.sin(g_sheepTime);
  // Arms: biased around ±15 deg like original (rotate around Z)
  g_rightArmShoulder   = -walk * 15 + 15;
  g_leftArmShoulder    =  walk * 15 - 15;
  g_rightArmElbow      =  Math.abs(walk) * 10;
  g_leftArmElbow       =  Math.abs(walk) * 10;
  g_rightLegHip        =  walk;
  g_leftLegHip         = -walk;
  g_rightLegKnee       =  Math.abs(walk) * 0.4;
  g_leftLegKnee        =  Math.abs(walk) * 0.4;

  _mBase.setTranslate(SHEEP_X, 2.5, SHEEP_Z);
  _mBase.rotate(g_sheepTime * 20 % 360, 0, 1, 0);

  _drawBody(gl);
}

// ── Body — exact original transforms ─────────────────────────
function _drawBody(gl) {
  var p = _mPool;

  // 1. BODY
  p[0].set(_mBase); p[0].translate(0, 0.5, 0); p[0].scale(0.7, 1.5, 0.65);
  _ss(gl, p[0], SC.white, g_sheepSphere);

  // 2. HEAD
  p[1].set(_mBase); p[1].translate(0, 1.75, 0.4); p[1].rotate(-45,1,0,0); p[1].scale(0.40, 0.65, 0.40);
  _ss(gl, p[1], SC.darkGray, g_sheepSphere);

  // 3 & 4. EYES
  p[2].set(_mBase); p[2].translate( 0.15, 1.75, 0.85); p[2].rotate(55,1,0,0); p[2].scale(0.1, 0.05, 0.1);
  _ss(gl, p[2], SC.white, g_sheepSphere);
  p[3].set(_mBase); p[3].translate(-0.15, 1.75, 0.85); p[3].rotate(55,1,0,0); p[3].scale(0.1, 0.05, 0.1);
  _ss(gl, p[3], SC.white, g_sheepSphere);

  // 5 & 6. EARS
  p[4].set(_mBase); p[4].translate( 0.5, 1.75, 0); p[4].rotate(-90,0,1,0); p[4].rotate( 45,1,0,0); p[4].scale(0.3, 0.65, 0.2);
  _ss(gl, p[4], SC.darkGray, g_sheepSphere);
  p[5].set(_mBase); p[5].translate(-0.5, 1.75, 0); p[5].rotate(-90,0,1,0); p[5].rotate(-45,1,0,0); p[5].scale(0.3, 0.65, 0.2);
  _ss(gl, p[5], SC.darkGray, g_sheepSphere);

  // 7. TAIL
  p[6].set(_mBase); p[6].translate(0, -0.2, -0.6); p[6].rotate(g_tailAngle,1,0,0); p[6].translate(0,0,-0.2); p[6].scale(0.15,0.15,0.4);
  _ss(gl, p[6], SC.white, g_sheepSphere);

  // 8-11. RIGHT ARM
  _drawArm(gl,  0.65, 7,  g_rightArmShoulder, g_rightArmElbow);
  // 12-15. LEFT ARM
  _drawArm(gl, -0.65, 11, g_leftArmShoulder,  g_leftArmElbow);
  // 16-19. RIGHT LEG
  _drawLeg(gl,  0.4, 15, g_rightLegHip, g_rightLegKnee);
  // 20-23. LEFT LEG
  _drawLeg(gl, -0.4, 19, g_leftLegHip,  g_leftLegKnee);
}

function _drawArm(gl, xOff, si, shoulder, elbow) {
  var p = _mPool;

  // Upper arm
  p[si].set(_mBase); p[si].translate(xOff,1.2,0); p[si].rotate(shoulder,0,0,1); p[si].translate(0,-0.5,0); p[si].scale(0.3,1.0,0.3);
  _ss(gl, p[si], SC.darkGray, g_sheepCylinder);

  // Elbow sphere
  p[si+1].set(_mBase); p[si+1].translate(xOff,1.2,0); p[si+1].rotate(shoulder,0,0,1); p[si+1].translate(0,-1.0,0); p[si+1].scale(0.2,0.2,0.2);
  _ss(gl, p[si+1], SC.darkGray, g_sheepSphere);

  // Forearm
  p[si+2].set(_mBase); p[si+2].translate(xOff,1.2,0); p[si+2].rotate(shoulder,0,0,1); p[si+2].translate(0,-1.0,0); p[si+2].rotate(elbow,0,0,1); p[si+2].translate(0,-0.5,0); p[si+2].scale(0.25,1.0,0.25);
  _ss(gl, p[si+2], SC.darkGray, g_sheepCylinder);

  // Hand sphere
  p[si+3].set(_mBase); p[si+3].translate(xOff,1.2,0); p[si+3].rotate(shoulder,0,0,1); p[si+3].translate(0,-1.0,0); p[si+3].rotate(elbow,0,0,1); p[si+3].translate(0,-1.0,0); p[si+3].scale(0.25,0.25,0.25);
  _ss(gl, p[si+3], SC.darkGray, g_sheepSphere);
}

function _drawLeg(gl, xOff, si, hip, knee) {
  var p = _mPool;

  // Thigh
  p[si].set(_mBase); p[si].translate(xOff,-0.5,0); p[si].rotate(hip,1,0,0); p[si].translate(0,-0.5,0); p[si].scale(0.3,1.0,0.3);
  _ss(gl, p[si], SC.darkGray, g_sheepCylinder);

  // Knee sphere
  p[si+1].set(_mBase); p[si+1].translate(xOff,-0.5,0); p[si+1].rotate(hip,1,0,0); p[si+1].translate(0,-1.0,0); p[si+1].scale(0.25,0.25,0.25);
  _ss(gl, p[si+1], SC.darkGray, g_sheepSphere);

  // Shin
  p[si+2].set(_mBase); p[si+2].translate(xOff,-0.5,0); p[si+2].rotate(hip,1,0,0); p[si+2].translate(0,-1.0,0); p[si+2].rotate(knee,1,0,0); p[si+2].translate(0,-0.5,0); p[si+2].scale(0.25,1.0,0.25);
  _ss(gl, p[si+2], SC.darkGray, g_sheepCylinder);

  // Hoof cube
  p[si+3].set(_mBase); p[si+3].translate(xOff,-0.5,0); p[si+3].rotate(hip,1,0,0); p[si+3].translate(0,-1.0,0); p[si+3].rotate(knee,1,0,0); p[si+3].translate(0,-1.0,0); p[si+3].scale(0.25,0.2,0.3);
  _ss(gl, p[si+3], SC.black, g_sheepCubeData);
}

// ── Minimal draw — only model matrix + colour change per part ─
function _ss(gl, modelMatrix, color, bufData) {
  gl.uniformMatrix4fv(g_sl.u_ModelMatrix, false, modelMatrix.elements);
  gl.uniform3fv(g_sl.u_Color, color);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufData.vertexBuffer);
  gl.vertexAttribPointer(g_sl.a_Position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufData.normalBuffer);
  gl.vertexAttribPointer(g_sl.a_Normal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufData.indexBuffer);
  gl.drawElements(gl.TRIANGLES, bufData.numIndices, gl.UNSIGNED_SHORT, 0);
}

// ── Geometry (init once) ──────────────────────────────────────
function _initSheepSphere(gl) {
  var DIV=16, pos=[], nor=[], idx=[];
  for (var j=0;j<=DIV;j++) {
    var aj=j*Math.PI/DIV, sj=Math.sin(aj), cj=Math.cos(aj);
    for (var i=0;i<=DIV;i++) { var ai=i*2*Math.PI/DIV, x=Math.sin(ai)*sj, y=cj, z=Math.cos(ai)*sj; pos.push(x,y,z); nor.push(x,y,z); }
  }
  for (var j=0;j<DIV;j++) for (var i=0;i<DIV;i++) { var p1=j*(DIV+1)+i, p2=p1+(DIV+1); idx.push(p1,p2,p1+1,p1+1,p2,p2+1); }
  _up(gl, g_sheepSphere, pos, nor, idx);
}

function _initSheepCylinder(gl) {
  var SEG=12, pos=[], nor=[], idx=[];
  for (var i=0;i<=SEG;i++) { var a=(i/SEG)*Math.PI*2, x=Math.cos(a)*0.5, z=Math.sin(a)*0.5; pos.push(x,-0.5,z); nor.push(x*2,0,z*2); pos.push(x,0.5,z); nor.push(x*2,0,z*2); }
  for (var i=0;i<SEG;i++) { var p=i*2; idx.push(p,p+2,p+1,p+1,p+2,p+3); }
  var bc=pos.length/3; pos.push(0,-0.5,0); nor.push(0,-1,0);
  for (var i=0;i<=SEG;i++) { var a=(i/SEG)*Math.PI*2; pos.push(Math.cos(a)*0.5,-0.5,Math.sin(a)*0.5); nor.push(0,-1,0); }
  for (var i=0;i<SEG;i++) idx.push(bc,bc+i+1,bc+i+2);
  var tc=pos.length/3; pos.push(0,0.5,0); nor.push(0,1,0);
  for (var i=0;i<=SEG;i++) { var a=(i/SEG)*Math.PI*2; pos.push(Math.cos(a)*0.5,0.5,Math.sin(a)*0.5); nor.push(0,1,0); }
  for (var i=0;i<SEG;i++) idx.push(tc,tc+i+2,tc+i+1);
  _up(gl, g_sheepCylinder, pos, nor, idx);
}

function _initSheepCube(gl) {
  var pos=[-0.5,-0.5,0.5,0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,0.5,0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,0.5,-0.5,-0.5,-0.5,0.5,-0.5,-0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,-0.5,0.5,-0.5,0.5,-0.5,-0.5,0.5,0.5,-0.5,-0.5,0.5,0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,0.5,-0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,0.5,-0.5];
  var nor=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0];
  var idx=[0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23];
  _up(gl, g_sheepCubeData, pos, nor, idx);
}

function _up(gl, obj, pos, nor, idx) {
  obj.vertexBuffer = _mkBuf(gl, gl.ARRAY_BUFFER,         new Float32Array(pos));
  obj.normalBuffer = _mkBuf(gl, gl.ARRAY_BUFFER,         new Float32Array(nor));
  obj.indexBuffer  = _mkBuf(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx));
  obj.numIndices   = idx.length;
}

function _mkBuf(gl, type, data) {
  var b = gl.createBuffer(); gl.bindBuffer(type, b); gl.bufferData(type, data, gl.STATIC_DRAW); return b;
}