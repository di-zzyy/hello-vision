// Canvas and UI setup
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const scoreEl = document.getElementById("score");
const hiScoreEl = document.getElementById("hiScore");

// Assets
const playerImg = new Image();
playerImg.src = "./logo.svg";

// Game constants
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 60;
const PLAYER_GROUND_Y = 220; // player's top-left Y when standing on ground
const FLOOR_Y = PLAYER_GROUND_Y + PLAYER_HEIGHT; // absolute ground line in canvas coords

// Game state
let isRunning = false;
let gameOver = false;
let animationId = null;
let frame = 0;
let score = 0;
let hiScore = 0;
let spawnCountdown = 0;

// Entities
let player = {
  x: 50,
  y: PLAYER_GROUND_Y,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  dy: 0,
  gravity: 0.8,
  jumpPower: -13,
  grounded: true,
  forwardSpeed: 2.0,
};

let bullets = [];
let obstacles = [];

// Helpers
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateScoreUI() {
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
  if (hiScoreEl) hiScoreEl.textContent = `Best: ${hiScore}`;
}

// Input
startBtn?.addEventListener("click", () => startGame());

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!isRunning) {
      startGame();
    } else if (player.grounded) {
      jump();
    }
  }
  if (e.code === "Enter") {
    if (isRunning) shoot();
  }
  if (e.code === "KeyR") {
    restartGame();
  }
});

canvas.addEventListener("click", () => {
  if (isRunning) shoot();
});

// Actions
function startGame() {
  if (isRunning) return;
  resetGameState();
  isRunning = true;
  animationId = requestAnimationFrame(update);
}

function restartGame() {
  isRunning = false;
  gameOver = false;
  cancelAnimationFrame(animationId);
  startGame();
}

function resetGameState() {
  player.x = 50;
  player.y = PLAYER_GROUND_Y;
  player.dy = 0;
  player.grounded = true;

  bullets = [];
  obstacles = [];
  frame = 0;
  score = 0;
  spawnCountdown = randInt(60, 110);
  updateScoreUI();
}

function jump() {
  player.dy = player.jumpPower;
  player.grounded = false;
}

function shoot() {
  bullets.push({
    x: player.x + player.width,
    y: player.y + player.height / 2 - 3,
    width: 16,
    height: 6,
    speed: 8,
  });
}

function createObstacle() {
  const isAir = Math.random() < 0.5;
  const width = randInt(35, 60);
  const height = randInt(30, 60);
  const speed = 5 + Math.min(4, Math.floor(frame / 1200)); // slowly increases over time
  const y = isAir ? randInt(120, 180) : FLOOR_Y - height;

  obstacles.push({
    x: canvas.width + randInt(0, 80),
    y,
    width,
    height,
    speed,
    color: isAir ? "#5a8dee" : "#cc5544",
    type: isAir ? "air" : "ground",
  });
}

function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function drawGround() {
  ctx.strokeStyle = "#2b4b6f";
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
  ctx.fillStyle = "#222";
  ctx.font = "20px Arial";
  ctx.fillText("Press Space or click Start", canvas.width / 2 - 150, 60);
}

// Game loop
function update() {
  if (!isRunning) return; // guard if stopped
  if (gameOver) {
    isRunning = false;
    hiScore = Math.max(hiScore, score);
    updateScoreUI();
    drawGameOver();
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frame++;

  // Gravity
  player.dy += player.gravity;
  player.y += player.dy;

  // Ground collision
  if (player.y > PLAYER_GROUND_Y) {
    player.y = PLAYER_GROUND_Y;
    player.dy = 0;
    player.grounded = true;
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
    spawnCountdown = randInt(60, 110);
  }

  // Obstacles move and collide
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= o.speed;
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x, o.y, o.width, o.height);

    // Player collision
    if (isColliding(player, o)) {
      gameOver = true;
    }

    // Bullet collision
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (isColliding(b, o)) {
        obstacles.splice(i, 1);
        bullets.splice(j, 1);
        score += 5;
        break;
      }
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
}

// Initial idle draw
playerImg.onload = () => {
  updateScoreUI();
  drawStartPrompt();
};
