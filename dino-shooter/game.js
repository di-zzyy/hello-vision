// --- Canvas Setup ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// --- Load Images ---
const playerImg = new Image();
playerImg.src = "./logo.svg"; // Main character

const ewObstacleImg = new Image();
ewObstacleImg.src = "./assets/ew-device.png"; // ✅ Your new ground obstacle

const bulletImg = new Image();
bulletImg.src = "./assets/bullet.png"; // If this doesn't exist yet, you can add it, or I'll make one for you next!

// --- Game Variables ---
let player = {
  x: 50,
  y: 220,
  width: 60,
  height: 60,
  dy: 0,
  gravity: 0.8,
  jumpPower: -13,
  grounded: true
};

let bullets = [];
let obstacles = [];
let frame = 0;
let score = 0;
let gameOver = false;

// --- Event Listeners ---
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && player.grounded) jump();
  if (e.code === "Enter") shoot();
});

function jump() {
  player.dy = player.jumpPower;
  player.grounded = false;
}

function shoot() {
  bullets.push({
    x: player.x + player.width,
    y: player.y + player.height / 2 - 5,
    width: 15,
    height: 10,
    speed: 8
  });
}

// --- Obstacle Generator ---
function createObstacle() {
  obstacles.push({
    x: canvas.width,
    y: 230, // ✅ Slightly adjusted so device sits well on ground
    width: 70, // ✅ Adjust for realistic proportions
    height: 70,
    img: ewObstacleImg,
    speed: 5
  });
}

// --- Collision Detection ---
function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// --- Game Loop ---
function update() {
  if (gameOver) return drawGameOver();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frame++;

  // Player gravity
  player.dy += player.gravity;
  player.y += player.dy;

  // Ground collision
  if (player.y > 220) {
    player.y = 220;
    player.dy = 0;
    player.grounded = true;
  }

  // Draw player
  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

  // Handle bullets
  bullets.forEach((bullet, i) => {
    bullet.x += bullet.speed;
    ctx.drawImage(bulletImg, bullet.x, bullet.y, bullet.width, bullet.height);

    // Remove bullets off screen
    if (bullet.x > canvas.width) bullets.splice(i, 1);
  });

  // Handle obstacles
  if (frame % 120 === 0) createObstacle();
  obstacles.forEach((obstacle, i) => {
    obstacle.x -= obstacle.speed;
    ctx.drawImage(obstacle.img, obstacle.x, obstacle.y, obstacle.width, obstacle.height);

    // Collision with player
    if (isColliding(player, obstacle)) {
      gameOver = true;
    }

    // Collision with bullets
    bullets.forEach((bullet, j) => {
      if (isColliding(bullet, obstacle)) {
        obstacles.splice(i, 1);
        bullets.splice(j, 1);
        score += 5;
      }
    });

    // Remove obstacles off screen
    if (obstacle.x + obstacle.width < 0) {
      obstacles.splice(i, 1);
      score++;
    }
  });

  // Draw score
  ctx.fillStyle = "#333";
  ctx.font = "20px Arial";
  ctx.fillText(`Score: ${score}`, 20, 30);

  requestAnimationFrame(update);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "40px Arial";
  ctx.fillText("Game Over!", canvas.width / 2 - 100, canvas.height / 2);
  ctx.font = "20px Arial";
  ctx.fillText(`Final Score: ${score}`, canvas.width / 2 - 60, canvas.height / 2 + 40);
}

update();

