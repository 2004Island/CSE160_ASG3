// ============================================================
//  src/cube.js
//
//  TWO rendering modes:
//
//  1. Cube class — for single one-off cubes (sky, ground).
//     Same API as before: new Cube(), set .matrix/.color/.textureNum,
//     call .render(gl, locs). Pre-allocate instances; don't create
//     inside the render loop.
//
//  2. CubeBatch — for many static cubes (walls).
//     buildBatch(cubeList) bakes all geometry into ONE VBO.
//     drawBatch(gl, locs) issues a single gl.drawArrays call.
//     Call rebuildBatch() whenever the map changes.
// ============================================================

'use strict';

// ── Shared VBO for single Cube instances ─────────────────────
var _cubeVBO  = null;
var _cubeData = null;

function _buildCubeVerts() {
  return new Float32Array([
    // Front  (z=+0.5)
    -0.5,-0.5, 0.5, 0,0,  0.5,-0.5, 0.5, 1,0,  0.5, 0.5, 0.5, 1,1,
    -0.5,-0.5, 0.5, 0,0,  0.5, 0.5, 0.5, 1,1, -0.5, 0.5, 0.5, 0,1,
    // Back   (z=-0.5)
     0.5,-0.5,-0.5, 0,0, -0.5,-0.5,-0.5, 1,0, -0.5, 0.5,-0.5, 1,1,
     0.5,-0.5,-0.5, 0,0, -0.5, 0.5,-0.5, 1,1,  0.5, 0.5,-0.5, 0,1,
    // Left   (x=-0.5)
    -0.5,-0.5,-0.5, 0,0, -0.5,-0.5, 0.5, 1,0, -0.5, 0.5, 0.5, 1,1,
    -0.5,-0.5,-0.5, 0,0, -0.5, 0.5, 0.5, 1,1, -0.5, 0.5,-0.5, 0,1,
    // Right  (x=+0.5)
     0.5,-0.5, 0.5, 0,0,  0.5,-0.5,-0.5, 1,0,  0.5, 0.5,-0.5, 1,1,
     0.5,-0.5, 0.5, 0,0,  0.5, 0.5,-0.5, 1,1,  0.5, 0.5, 0.5, 0,1,
    // Top    (y=+0.5)
    -0.5, 0.5, 0.5, 0,0,  0.5, 0.5, 0.5, 1,0,  0.5, 0.5,-0.5, 1,1,
    -0.5, 0.5, 0.5, 0,0,  0.5, 0.5,-0.5, 1,1, -0.5, 0.5,-0.5, 0,1,
    // Bottom (y=-0.5)
    -0.5,-0.5,-0.5, 0,0,  0.5,-0.5,-0.5, 1,0,  0.5,-0.5, 0.5, 1,1,
    -0.5,-0.5,-0.5, 0,0,  0.5,-0.5, 0.5, 1,1, -0.5,-0.5, 0.5, 0,1,
  ]);
}

function initCubeBuffer(gl) {
  _cubeData = _buildCubeVerts();
  _cubeVBO  = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, _cubeVBO);
  gl.bufferData(gl.ARRAY_BUFFER, _cubeData, gl.STATIC_DRAW);
}

// ── Cube class (sky box, ground — pre-allocate, don't new in loop) ──
class Cube {
  constructor() {
    this.matrix     = new Matrix4();
    this.color      = [1.0, 1.0, 1.0, 1.0];
    this.textureNum = -1;
  }

  render(gl, locs) {
    const F = 4, STRIDE = F * 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, _cubeVBO);
    gl.vertexAttribPointer(locs.a_Position, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(locs.a_Position);
    gl.vertexAttribPointer(locs.a_UV, 2, gl.FLOAT, false, STRIDE, F * 3);
    gl.enableVertexAttribArray(locs.a_UV);
    gl.uniformMatrix4fv(locs.u_ModelMatrix, false, this.matrix.elements);
    gl.uniform4fv(locs.u_baseColor, this.color);
    if (this.textureNum < 0) {
      gl.uniform1f(locs.u_texColorWeight, 0.0);
      gl.uniform1i(locs.u_whichTexture, -1);
    } else {
      gl.uniform1f(locs.u_texColorWeight, 1.0);
      gl.uniform1i(locs.u_whichTexture, this.textureNum);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }
}

// ── CubeBatch — bake N cubes into ONE VBO, ONE draw call ─────
//
//  Usage:
//    var batch = new CubeBatch();
//    batch.build(gl, cubeList);   // cubeList = [{tx,ty,tz, sx,sy,sz, texNum}, ...]
//    batch.draw(gl, locs);        // ONE draw call for all cubes
//    batch.build(gl, newList);    // call again when map changes
//
//  Each cube in cubeList needs:
//    tx,ty,tz  — translation
//    sx,sy,sz  — scale (1,1,1 for unit cubes)
//    texNum    — texture index (0, 1, 2...)

class CubeBatch {
  constructor() {
    this.vbo        = null;
    this.vertCount  = 0;
    this.texNum     = 0;    // all cubes in one batch share same texture
  }

  // Build or rebuild the batch VBO from a list of cube descriptors
  build(gl, cubeDescs, texNum) {
    this.texNum = texNum;

    // 36 verts per cube, 5 floats per vert
    var buf = new Float32Array(cubeDescs.length * 36 * 5);
    var off = 0;

    // Template: unit cube face verts [x,y,z, u,v] × 36
    var T = _cubeData; // reuse the existing unit cube template

    for (var c = 0; c < cubeDescs.length; c++) {
      var d  = cubeDescs[c];
      var tx = d.tx, ty = d.ty, tz = d.tz;
      var sx = d.sx, sy = d.sy, sz = d.sz;

      // Transform each of the 36 template verts by this cube's TRS
      for (var v = 0; v < 36; v++) {
        var i = v * 5;
        buf[off++] = T[i  ] * sx + tx;  // x
        buf[off++] = T[i+1] * sy + ty;  // y
        buf[off++] = T[i+2] * sz + tz;  // z
        buf[off++] = T[i+3];             // u
        buf[off++] = T[i+4];             // v
      }
    }

    if (this.vbo) gl.deleteBuffer(this.vbo);
    this.vbo       = gl.createBuffer();
    this.vertCount = cubeDescs.length * 36;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  }

  // Draw the whole batch — identity model matrix (positions are baked in)
  draw(gl, locs) {
    if (!this.vbo || this.vertCount === 0) return;

    const F = 4, STRIDE = F * 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.vertexAttribPointer(locs.a_Position, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(locs.a_Position);
    gl.vertexAttribPointer(locs.a_UV, 2, gl.FLOAT, false, STRIDE, F * 3);
    gl.enableVertexAttribArray(locs.a_UV);

    // Identity model matrix — positions are already in world space
    gl.uniformMatrix4fv(locs.u_ModelMatrix, false, _identityElements);
    gl.uniform4fv(locs.u_baseColor, _white4);
    gl.uniform1f(locs.u_texColorWeight, 1.0);
    gl.uniform1i(locs.u_whichTexture, this.texNum);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertCount);
  }
}

// Pre-allocated constants used by CubeBatch.draw
var _identityElements = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
var _white4           = new Float32Array([1,1,1,1]);