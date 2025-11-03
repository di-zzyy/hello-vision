// Canvas and UI setup
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const scoreEl = document.getElementById("score");
const hiScoreEl = document.getElementById("hiScore");

// Assets
const playerImg = new Image();
playerImg.src = "./logo.svg";
const groundObstacleImg = new Image();
groundObstacleImg.src = "./reb.png";
const airObstacleImg = new Image();
airObstacleImg.src = "./air-1.png";
const largeAirObstacleImg = new Image();
largeAirObstacleImg.src = "./puylo.png";

// Game constants
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 60;
// Ground obstacle dimensions (uniform size), keeping a 5:4 height:width ratio
// 10% larger than previous size: height 66px, width ~52.8px
const GROUND_OBSTACLE_HEIGHT = 66; // 66px tall (10% bigger)
const GROUND_OBSTACLE_WIDTH = 53; // ≈52.8px wide (5:4 ratio with height)
const PLAYER_GROUND_Y = 220; // player's top-left Y when standing on ground
const FLOOR_Y = PLAYER_GROUND_Y + PLAYER_HEIGHT; // absolute ground line in canvas coords
// Shooting rate limit
const MAX_SHOTS_PER_SECOND = 4;
const MIN_SHOT_INTERVAL_MS = Math.floor(1000 / MAX_SHOTS_PER_SECOND);

// Air obstacle standardized size (largest previous variant)
const AIR_OBSTACLE_SIZE = { width: 60, height: 54 };
const LARGE_AIR_OBSTACLE_SIZE = { width: 92, height: 92 };

// Jump forgiveness and hitbox tuning
const JUMP_BUFFER_FRAMES = 10; // allow jump input buffered for ~160ms
const COYOTE_FRAMES = 9; // allow jump shortly after leaving ground (~150ms)
const HITBOX_INSET_X = 6; // shrink player hitbox horizontally to reduce grazes
const HITBOX_INSET_Y = 4; // shrink player hitbox vertically to reduce grazes
const VERTICAL_GRACE_PX = 6; // ignore tiny vertical overlaps with obstacle tops

// Game state
let isRunning = false;
let gameOver = false;
let animationId = null;
let frame = 0;
let score = 0;
let hiScore = Number(localStorage.getItem("hiScore") || "0");
let spawnCountdown = 0;
let lastShotTimeMs = 0;

// Entities
let player = {
  x: 50,
  y: PLAYER_GROUND_Y,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  dy: 0,
  gravity: 0.72, // slightly lower gravity: longer airtime
  jumpPower: -14.5, // stronger jump: higher peak
  grounded: true,
  forwardSpeed: 2.0,
};

let bullets = [];
let obstacles = [];

// Input forgiveness state
let jumpBufferFrames = 0; // counts down when jump was requested recently
let coyoteFrames = 0; // counts down after leaving ground

// Helpers
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateScoreUI() {
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
  if (hiScoreEl) hiScoreEl.textContent = `Best: ${hiScore}`;
}

function updateStartButtonVisibility() {
  if (!startBtn) return;
  if (isRunning || gameOver) {
    startBtn.classList.add("hidden");
  } else {
    startBtn.classList.remove("hidden");
  }
}

// Input
startBtn?.addEventListener("click", () => startGame());

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (gameOver) {
      restartGame();
    } else if (!isRunning) {
      startGame();
    } else {
      // buffer the jump input; will be consumed in the update loop
      jumpBufferFrames = JUMP_BUFFER_FRAMES;
    }
  }
  if (e.code === "Enter") {
    if (isRunning) shoot();
  }
  if (e.code === "KeyR") {
    restartGame();
  }
});

// Allow shooting by clicking anywhere in the browser window (not just the canvas)
function handleGlobalPointerDown(e) {
  if (!isRunning) return;
  const target = e.target;
  // Ignore clicks on Start/Restart button to avoid unintended immediate shots
  if (startBtn && (target === startBtn || startBtn.contains(target))) return;
  shoot();
}
if ("onpointerdown" in window) {
  window.addEventListener("pointerdown", handleGlobalPointerDown);
} else {
  window.addEventListener("mousedown", handleGlobalPointerDown);
  window.addEventListener("touchstart", handleGlobalPointerDown, { passive: true });
}

// Touch: tap to start/jump (mobile-friendly)
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    if (!isRunning) {
      startGame();
    } else {
      // buffer jump on touch for mobile
      jumpBufferFrames = JUMP_BUFFER_FRAMES;
    }
  },
  { passive: false }
);

// Actions
function startGame() {
  if (isRunning) return;
  resetGameState();
  isRunning = true;
  // Hide Start/Restart button during gameplay
  updateStartButtonVisibility();
  animationId = requestAnimationFrame(update);
}

function restartGame() {
  isRunning = false;
  gameOver = false;
  cancelAnimationFrame(animationId);
  startGame();
}

function resetGameState() {
  gameOver = false;
  player.x = 50;
  player.y = PLAYER_GROUND_Y;
  player.dy = 0;
  player.grounded = true;

  bullets = [];
  obstacles = [];
  frame = 0;
  score = 0;
  spawnCountdown = nextSpawnCountdown();
  updateScoreUI();
}

function jump() {
  player.dy = player.jumpPower;
  player.grounded = false;
}

function shoot() {
  const now = performance.now();
  if (now - lastShotTimeMs < MIN_SHOT_INTERVAL_MS) return; // rate limited
  lastShotTimeMs = now;

  bullets.push({
    x: player.x + player.width,
    y: player.y + player.height / 2 - 3,
    width: 16,
    height: 6,
    speed: 8,
  });
}

function createObstacle() {
  // Decide category: ground vs air
  const isAir = Math.random() < 0.5;
  const speed = 5 + Math.floor(getDifficulty() * 4); // slowly increases over time

  if (!isAir) {
    // Ground obstacle: use uniform dimensions with 5:4 height:width ratio
    const width = GROUND_OBSTACLE_WIDTH;
    const height = GROUND_OBSTACLE_HEIGHT;
    const y = FLOOR_Y - height;
    obstacles.push({
      x: canvas.width + randInt(0, 80),
      y,
      width,
      height,
      speed,
      color: "#535353",
      type: "ground",
    });
  } else {
    const airVariantRoll = Math.random();
    if (airVariantRoll < 0.65) {
      // Air obstacle: oscillates up and down while moving horizontally
      const width = AIR_OBSTACLE_SIZE.width;
      const height = AIR_OBSTACLE_SIZE.height;
      const airLaneMinY = 90;
      const airLaneMaxY = FLOOR_Y - height - 10;
      const baseY = randInt(120, Math.max(120, airLaneMaxY - 20));
      const amplitude = randInt(12, 24);
      const phase = Math.random() * Math.PI * 2;
      const phaseSpeed = 0.05 + Math.random() * 0.06; // radians per frame
      obstacles.push({
        x: canvas.width + randInt(0, 80),
        y: baseY,
        baseY,
        width,
        height,
        speed,
        amplitude,
        phase,
        phaseSpeed,
        color: "#535353",
        type: "air_oscillating",
      });
    } else {
      // Large static air obstacle using puylo sprite
      const width = LARGE_AIR_OBSTACLE_SIZE.width;
      const height = LARGE_AIR_OBSTACLE_SIZE.height;
      const minY = 80;
      const maxY = Math.max(minY, FLOOR_Y - height - 20);
      const y = randInt(minY, maxY);
      const staticSpeed = Math.max(3, speed - 1); // slightly slower for fairness
      obstacles.push({
        x: canvas.width + randInt(40, 140),
        y,
        width,
        height,
        speed: staticSpeed,
        color: "#535353",
        type: "air_static_large",
        shakePhase: Math.random() * Math.PI * 2,
        shakeSpeed: 1.4 + Math.random() * 0.4,
        shakeAmplitudeX: randInt(3, 6),
      });
    }
  }
}

function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function getPlayerHitbox() {
  // Shrink the collision box to be more forgiving
  return {
    x: player.x + HITBOX_INSET_X,
    y: player.y + HITBOX_INSET_Y,
    width: player.width - 2 * HITBOX_INSET_X,
    height: player.height - 2 * HITBOX_INSET_Y,
  };
}

function drawGround() {
  ctx.strokeStyle = "#535353";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y + 2);
  ctx.lineTo(canvas.width, FLOOR_Y + 2);
  ctx.stroke();
}

function drawStartPrompt() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();
  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
  ctx.fillStyle = "#535353";
  ctx.font = "20px Arial";
  ctx.fillText("Press Space or click Start", canvas.width / 2 - 150, 60);
  updateStartButtonVisibility();
}

// Game loop
function update() {
  if (!isRunning) return; // guard if stopped
  if (gameOver) {
    isRunning = false;
    hiScore = Math.max(hiScore, score);
    try {
      localStorage.setItem("hiScore", String(hiScore));
    } catch (_) {
      // ignore storage errors
    }
    updateScoreUI();
    drawGameOver();
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frame++;

  // Maintain coyote timer and decrease jump buffer each frame
  if (player.grounded) {
    coyoteFrames = COYOTE_FRAMES;
  } else if (coyoteFrames > 0) {
    coyoteFrames--;
  }
  if (jumpBufferFrames > 0) jumpBufferFrames--;

  // Consume buffered jump using coyote time (before physics step)
  if (jumpBufferFrames > 0 && (player.grounded || coyoteFrames > 0)) {
    jump();
    jumpBufferFrames = 0;
    coyoteFrames = 0;
  }

  // Gravity
  player.dy += player.gravity;
  player.y += player.dy;

  // Ground collision
  if (player.y > PLAYER_GROUND_Y) {
    player.y = PLAYER_GROUND_Y;
    player.dy = 0;
    player.grounded = true;
  }

  // If we buffered a jump right before landing, trigger it now
  if (player.grounded && jumpBufferFrames > 0) {
    jump();
    jumpBufferFrames = 0;
    coyoteFrames = 0;
  }

  // Forward movement: ease to target X
  const targetX = 260;
  if (player.x < targetX) {
    player.x = Math.min(targetX, player.x + player.forwardSpeed);
  }

  // Draw ground and player
  drawGround();
  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.speed;
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(b.x, b.y, b.width, b.height);
    if (b.x > canvas.width) bullets.splice(i, 1);
  }

  // Obstacles spawn
  spawnCountdown--;
  if (spawnCountdown <= 0) {
    createObstacle();
    spawnCountdown = nextSpawnCountdown();
  }

  // Obstacles move and collide
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= o.speed;

    // Air-flying obstacles track the player's vertical position
    if (o.type === "air_flying") {
      const playerCenterY = player.y + player.height / 2;
      const obstacleCenterY = o.y + o.height / 2;
      const maxVerticalSpeed = 1.5 + getDifficulty() * 2.0; // ramps with difficulty
      const deltaY = playerCenterY - obstacleCenterY;
      if (Math.abs(deltaY) > 0.5) {
        const step = Math.sign(deltaY) * Math.min(Math.abs(deltaY), maxVerticalSpeed);
        o.y += step;
      }
      // keep within air lane bounds
      const minY = 90;
      const maxY = FLOOR_Y - o.height - 10;
      if (o.y < minY) o.y = minY;
      if (o.y > maxY) o.y = maxY;
    }
    // Air-oscillating obstacles bob up and down sinusoidally
    if (o.type === "air_oscillating") {
      o.phase += o.phaseSpeed;
      const minY = 90;
      const maxY = FLOOR_Y - o.height - 10;
      const targetY = o.baseY + Math.sin(o.phase) * o.amplitude;
      o.y = Math.max(minY, Math.min(maxY, targetY));
    }
    let renderX = o.x;
    let renderY = o.y;

    if (o.type === "air_static_large") {
      o.shakePhase += o.shakeSpeed;
      const shakeX = Math.sin(o.shakePhase) * o.shakeAmplitudeX;
      renderX += shakeX;
    }

    if (
      o.type === "ground" &&
      groundObstacleImg.complete &&
      groundObstacleImg.naturalWidth > 0
    ) {
      ctx.drawImage(groundObstacleImg, renderX, renderY, o.width, o.height);
    } else if (
      o.type === "air_static_large" &&
      largeAirObstacleImg.complete &&
      largeAirObstacleImg.naturalWidth > 0
    ) {
      ctx.drawImage(largeAirObstacleImg, renderX, renderY, o.width, o.height);
    } else if (
      o.type.startsWith("air") &&
      airObstacleImg.complete &&
      airObstacleImg.naturalWidth > 0
    ) {
      ctx.drawImage(airObstacleImg, renderX, renderY, o.width, o.height);
    } else {
      ctx.fillStyle = o.color;
      ctx.fillRect(renderX, renderY, o.width, o.height);
    }

    // Player collision with forgiving hitbox and top-overlap grace
    const ph = getPlayerHitbox();
    const obstacleBounds =
      o.type === "air_static_large"
        ? { x: renderX, y: renderY, width: o.width, height: o.height }
        : o;

    if (isColliding(ph, obstacleBounds)) {
      const playerBottom = ph.y + ph.height;
      const obstacleTop = obstacleBounds.y;
      const verticalOverlap = playerBottom - obstacleTop; // > 0 means overlapping from top
      if (!(verticalOverlap > 0 && verticalOverlap <= VERTICAL_GRACE_PX)) {
        gameOver = true;
      }
    }

    // Bullet collision
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (!isColliding(b, obstacleBounds)) continue;

      if (o.type.startsWith("air")) {
        obstacles.splice(i, 1);
        bullets.splice(j, 1);
        score += o.type === "air_static_large" ? 8 : 5;
        break;
      }

      // Bullets dissipate against ground obstacles without removing them
      bullets.splice(j, 1);
    }

    // Off-screen
    if (o.x + o.width < 0) {
      obstacles.splice(i, 1);
      score++;
    }
  }

  // Score (DOM)
  updateScoreUI();

  animationId = requestAnimationFrame(update);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "36px Arial";
  ctx.fillText("Game Over!", canvas.width / 2 - 100, canvas.height / 2 - 10);
  ctx.font = "20px Arial";
  ctx.fillText(`Final Score: ${score}`, canvas.width / 2 - 70, canvas.height / 2 + 20);
  ctx.fillText("Press Space or R to try again", canvas.width / 2 - 120, canvas.height / 2 + 50);
  updateStartButtonVisibility();
}

// Difficulty helpers: ramp up spawn rate and speed over time
function getDifficulty() {
  // 0 at start, 1 at ~100 seconds at 60fps
  return Math.min(1, frame / 6000);
}

function nextSpawnCountdown() {
  const baseMin = 60;
  const baseMax = 110;
  const reduction = Math.floor(getDifficulty() * 40); // up to ~40 frames reduction
  const min = Math.max(30, baseMin - reduction);
  const max = Math.max(min + 5, baseMax - reduction);
  return randInt(min, max);
}

// Initial idle draw
playerImg.onload = () => {
  updateScoreUI();
  drawStartPrompt();
};
