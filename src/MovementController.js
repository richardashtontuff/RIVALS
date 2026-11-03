/**
 * RIVALS — Kinematic character controller (spec §3).
 *
 * Fixed-timestep (60 Hz) movement loop, separate from the render loop.
 * Implements: walk / auto-sprint, crouch, slide (capsule ducking ~40% hitbox
 * reduction), slide-cancel (0.15-0.55 s window), slide-jump, double-jump
 * (Fists / Bow passive), dash (Scythe-style, sideways), and wall/ground
 * collision. All timings are tunable via CONFIG.MOVEMENT.
 */
import * as THREE from 'three';
import { CONFIG } from './config.js';

const M = CONFIG.MOVEMENT;
const _move = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _desired = new THREE.Vector3();

export class MovementController {
  constructor() {
    // World position of the character capsule (feet at y=0 on flat ground).
    this.position = new THREE.Vector3(0, M.STAND_HEIGHT / 2, 0);
    this.velocity = new THREE.Vector3();
    // Camera orientation (radians).
    this.yaw = 0;
    this.pitch = 0;
    this.height = M.STAND_HEIGHT;

    // State
    this.onGround = false;
    this.isSliding = false;
    this.slideStartTime = 0;
    this.slideDirection = new THREE.Vector3();
    this.hasDoubleJumped = false;
    this.doubleJumpAvailable = true;
    this.isDashing = false;
    this.dashStartTime = 0;
    this.dashDirection = new THREE.Vector3();
    this.lastDashTime = -Infinity;

    // Input edge detection
    this._prevJump = false;
  }

  /** Called by the input system on every pointermove while locked. */
  setLook(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  }

  /** Unit vector of where the character is facing (horizontal, y=0). */
  getForward() {
    _fwd.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    _fwd.y = 0;
    return _fwd.normalize();
  }
  getRight() {
    _right.set(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
    return _right;
  }

  /**
   * Advance one fixed step.
   * @param {number} dt   fixed step in seconds (1/60)
   * @param {object} input booleans: w,a,s,d,shift,crouch,jump,dash,reload,fire
   * @param {number} now  performance.now() milliseconds
   */
  update(dt, input, now) {
    const {
      WALK_SPEED, SPRINT_SPEED, AUTO_SPRINT, CROUCH_WALK_SPEED, SLIDE_SPEED,
      SLIDE_DURATION_S, SLIDE_HITBOX_REDUCE, SLIDE_CANCEL_WINDOW_START,
      SLIDE_CANCEL_WINDOW_END, JUMP_FORCE, DOUBLE_JUMP_FORCE, GRAVITY,
      GROUND_ACCEL, AIR_CONTROL, FRICTION, STAND_HEIGHT, CROUCH_HEIGHT,
      DASH_SPEED, DASH_DURATION_S, DASH_DISTANCE, DASH_COOLDOWN_S,
    } = M;

    // ---- Input direction (camera-relative) ----
    _move.set(0, 0, 0);
    const f = this.getForward();
    const r = this.getRight();
    if (input.w) _move.add(f);
    if (input.s) _move.sub(f);
    if (input.d) _move.add(r);
    if (input.a) _move.sub(r);
    const moving = _move.lengthSq() > 0.0001;
    if (moving) _move.normalize();

    const sprinting = AUTO_SPRINT ? moving : (input.shift && moving);
    const crouching = !!input.crouch;

    const justJumped = input.jump && !this._prevJump;
    this._prevJump = input.jump;

    // ---- Slide state machine ----
    const slideAge = this.isSliding ? (now - this.slideStartTime) / 1000 : 0;

    if (!this.isSliding && crouching && sprinting && moving && this.onGround) {
      this.isSliding = true;
      this.slideStartTime = now;
      this.slideDirection.copy(_move);
      this.velocity.y = 0;
    }

    // Slide ends by duration.
    if (this.isSliding && slideAge >= SLIDE_DURATION_S) {
      this.isSliding = false;
    }

    // Slide-cancel: jump inside the 0.15-0.55 s window keeps momentum + low
    // hitbox "hop"; releasing crouch after ~0.5 s also cancels.
    if (this.isSliding) {
      if (justJumped && slideAge >= SLIDE_CANCEL_WINDOW_START && slideAge <= SLIDE_CANCEL_WINDOW_END) {
        this._cancelSlideJump(JUMP_FORCE);
      } else if (!input.crouch && slideAge >= 0.5) {
        this.isSliding = false;
      }
    }

    // ---- Target speed & height ----
    let targetSpeed;
    if (this.isSliding) targetSpeed = SLIDE_SPEED;
    else if (sprinting) targetSpeed = SPRINT_SPEED;
    else if (crouching) targetSpeed = CROUCH_WALK_SPEED;
    else targetSpeed = WALK_SPEED;

    const targetHeight = (this.isSliding || crouching) ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.height += (targetHeight - this.height) * Math.min(1, dt * 12);

    // ---- Horizontal acceleration ----
    _desired.copy(_move).multiplyScalar(targetSpeed);

    if (this.isSliding) {
      // Preserve slide momentum with decay (no new directional input while sliding).
      this.velocity.x = this.slideDirection.x * SLIDE_SPEED;
      this.velocity.z = this.slideDirection.z * SLIDE_SPEED;
      const decay = 1 - Math.min(1, dt * FRICTION * 0.5);
      this.velocity.x *= decay;
      this.velocity.z *= decay;
    } else if (this.isDashing) {
      // Dash velocity applied below; decays naturally over its duration.
    } else {
      this.velocity.x += (_desired.x - this.velocity.x) * GROUND_ACCEL * dt;
      this.velocity.z += (_desired.z - this.velocity.z) * GROUND_ACCEL * dt;
      if (!this.onGround) {
        this.velocity.x += (_desired.x - this.velocity.x) * AIR_CONTROL * dt;
        this.velocity.z += (_desired.z - this.velocity.z) * AIR_CONTROL * dt;
      }
    }

    // ---- Dash (Scythe-style): short sharp burst, validated server-side. ----
    if (input.dash && now - this.lastDashTime >= DASH_COOLDOWN_S * 1000 && !this.isDashing) {
      this.isDashing = true;
      this.dashStartTime = now;
      this.lastDashTime = now;
      this.dashDirection.copy(moving ? _move : f);
      this.dashDirection.y = 0;
      this.dashDirection.normalize();
      this.velocity.x = this.dashDirection.x * DASH_SPEED;
      this.velocity.z = this.dashDirection.z * DASH_SPEED;
    }
    if (this.isDashing && now - this.dashStartTime >= DASH_DURATION_S * 1000) {
      this.isDashing = false;
    }

    // ---- Jump / double-jump ----
    if (this.onGround && justJumped) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
      this.hasDoubleJumped = false;
      this.isSliding = false;
    } else if (!this.onGround && justJumped && this.doubleJumpAvailable && !this.hasDoubleJumped) {
      this.velocity.y = DOUBLE_JUMP_FORCE;
      this.hasDoubleJumped = true;
    }

    // ---- Gravity & integration ----
    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    // ---- Ground (plane at y=0) ----
    const footY = this.height / 2;
    if (this.position.y < footY) {
      this.position.y = footY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
        this.onGround = true;
        if (!input.jump) this.hasDoubleJumped = false;
      }
    } else {
      this.onGround = false;
    }

    // ---- World bounds (temporary prototype arena clamp) ----
    const half = 58;
    let clamped = false;
    if (this.position.x < -half) { this.position.x = -half; this.velocity.x *= 0.2; clamped = true; }
    if (this.position.x > half) { this.position.x = half; this.velocity.x *= 0.2; clamped = true; }
    if (this.position.z < -half) { this.position.z = -half; this.velocity.z *= 0.2; clamped = true; }
    if (this.position.z > half) { this.position.z = half; this.velocity.z *= 0.2; clamped = true; }
    return clamped;
  }

  /** Jump out of a slide, keeping horizontal momentum (slide-cancel hop). */
  _cancelSlideJump(jumpForce) {
    this.isSliding = false;
    this.velocity.y = jumpForce * 0.95;
    this.onGround = false;
    this.hasDoubleJumped = false;
    // keep existing horizontal slide velocity (momentum preserved)
  }

  /** Apply an external impulse (explosive jump, lava bounce, grapple). */
  applyImpulse(vector) {
    this.velocity.add(vector);
  }
}
