// ============================================================
//  src/camera.js  —  First-person Camera
//
//  Design: orientation is stored as (yaw, pitch) angles.
//  Position is stored as eye[].
//
//  CRITICAL: _updateView() is NEVER called from mouse or key
//  handlers. Handlers only update numbers. _updateView() is
//  called exactly ONCE per frame by renderScene() in main.js
//  right before drawing. This prevents setLookAt() from being
//  hammered hundreds of times per second by mousemove events.
// ============================================================

'use strict';

class Camera {
  constructor() {
    this.fov      = 60;
    this.speed    = 0.15;
    this.panAngle = 3;     // degrees per Q/E key press

    this.eye   = [16, 1.5, 16];  // world position
    this.yaw   = 0;               // left/right angle (degrees), 0 = facing +X
    this.pitch = 0;               // up/down angle (degrees), clamped ±89

    this.viewMatrix       = new Matrix4();
    this.projectionMatrix = new Matrix4();

    // Jumping / gravity
    this.velY        = 0;      // current vertical velocity
    this.grounded    = true;   // true when standing on the ground
    this.groundY     = 1.5;    // eye height when standing
    this.jumpForce   = 0.18;   // initial upward velocity on jump
    this.gravity     = 0.012;  // downward acceleration per frame
  }

  setProjection(canvas) {
    this.projectionMatrix.setPerspective(
      this.fov,
      canvas.width / canvas.height,
      0.1,
      1000
    );
  }

  // ── Called ONCE per frame by renderScene() ────────────────
  // Converts yaw+pitch angles into a look direction and uploads
  // the view matrix. Never call this from input handlers.
  updateView() {
    var yawR     = this.yaw   * Math.PI / 180;
    var pitchR   = this.pitch * Math.PI / 180;
    var cosPitch = Math.cos(pitchR);

    var fx = Math.cos(yawR) * cosPitch;
    var fy = Math.sin(pitchR);
    var fz = Math.sin(yawR) * cosPitch;

    this.viewMatrix.setLookAt(
      this.eye[0],          this.eye[1],          this.eye[2],
      this.eye[0] + fx,     this.eye[1] + fy,     this.eye[2] + fz,
      0, 1, 0
    );
  }

  // ── Internal helpers (no trig, no allocation) ─────────────

  // Horizontal forward direction based on current yaw
  _fwd() {
    var r = this.yaw * Math.PI / 180;
    return [Math.cos(r), 0, Math.sin(r)];
  }

  // Horizontal right direction (90° clockwise from forward)
  // right = cross(forward, worldUp) with Y-up simplification:
  //   cross([cos,0,sin],[0,1,0]) = [0*sin-1*0, 1*cos-sin*0, 0*0-cos*1] -- wait
  // Easier: rotate yaw by -90 degrees
  //   cos(yaw-90) = sin(yaw),  sin(yaw-90) = -cos(yaw)
  _right() {
    var r = this.yaw * Math.PI / 180;
    return [Math.sin(r), 0, -Math.cos(r)];
  }

  // ── Movement — only updates numbers, no matrix work ───────

  moveForward() {
    var f = this._fwd();
    this.eye[0] += f[0] * this.speed;
    this.eye[2] += f[2] * this.speed;
  }

  moveBackwards() {
    var f = this._fwd();
    this.eye[0] -= f[0] * this.speed;
    this.eye[2] -= f[2] * this.speed;
  }

  moveLeft() {
    var r = this._right();
    this.eye[0] += r[0] * this.speed;
    this.eye[2] += r[2] * this.speed;
  }

  moveRight() {
    var r = this._right();
    this.eye[0] -= r[0] * this.speed;
    this.eye[2] -= r[2] * this.speed;
  }

  jump() {
    if (this.grounded) {
      this.velY     = this.jumpForce;
      this.grounded = false;
    }
  }

  // Called once per frame from tick() — applies gravity and moves eye vertically
  applyGravity() {
    if (!this.grounded) {
      this.velY      -= this.gravity;
      this.eye[1]    += this.velY;

      // Land on the ground
      if (this.eye[1] <= this.groundY) {
        this.eye[1]   = this.groundY;
        this.velY     = 0;
        this.grounded = true;
      }
    }
  }

  // ── Rotation — only updates yaw angle ─────────────────────

  panLeft()  { this.yaw -= this.panAngle; }
  panRight() { this.yaw += this.panAngle; }

  // ── Mouse look — only updates angles, no matrix work ──────

  mouseRotate(dx, dy) {
    var SENS = 0.05;
    this.yaw   += dx * SENS;
    this.pitch -= dy * SENS;
    if (this.pitch >  89) this.pitch =  89;
    if (this.pitch < -89) this.pitch = -89;
    // DO NOT call updateView() here
  }

  // ── Map helpers ───────────────────────────────────────────

  getMapPosition() {
    return {
      col: Math.floor(this.eye[0]),
      row: Math.floor(this.eye[2])
    };
  }

  getFrontMapPosition() {
    var f = this._fwd();
    return {
      col: Math.floor(this.eye[0] + f[0] * 1.5),
      row: Math.floor(this.eye[2] + f[2] * 1.5)
    };
  }
}