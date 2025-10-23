/* Logo Runner & Shooter - Chrome Dino-like game
   Controls: Space to jump, Mouse click to shoot, R to restart
*/
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const scoreEl = document.getElementById('score');
  const hiScoreEl = document.getElementById('hiScore');
  const logoInput = document.getElementById('logoInput');

  // Game constants
  const WORLD = { width: canvas.width, height: canvas.height };
  const GROUND_Y = WORLD.height - 40; // baseline
  const GRAVITY = 1800; // px/s^2
  const JUMP_VELOCITY = -700; // px/s upward
  const PLAYER = { width: 40, height: 40, x: 80 };
  const SCROLL_SPEED_START = 280; // px/s
  const SCROLL_ACCEL_PER_S = 10;  // px/s^2
  const BULLET_SPEED = 700; // px/s

  // Assets
  const defaultPlayerImage = new Image();
  defaultPlayerImage.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="10" fill="#0ea5e9"/>
    <path d="M18 34c0-8 6-14 14-14s14 6 14 14-6 14-14 14-14-6-14-14zm14-9a9 9 0 100 18 9 9 0 000-18z" fill="white"/>
  </svg>`);
  let playerImage = defaultPlayerImage;

  // Game state
  let state = 'idle'; // idle | running | gameover
  let tPrev = 0;
  let scrollSpeed = SCROLL_SPEED_START;
  let score = 0;
  let hiScore = Number(localStorage.getItem('logoRunnerHiScore') || 0);
  hiScoreEl.textContent = `Best: ${hiScore}`;

  const player = {
    x: PLAYER.x,
    y: GROUND_Y - PLAYER.height,
    width: PLAYER.width,
    height: PLAYER.height,
    vy: 0,
    onGround: true,
  };

  /** @type {{x:number,y:number,width:number,height:number,type:'ground'|'air',hit?:boolean}[]} */
  let obstacles = [];
  /** @type {{x:number,y:number,dx:number,dy:number,active:boolean}[]} */
  let bullets = [];
  let spawnTimer = 0;

  // Helpers
  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function resetGame() {
    player.x = PLAYER.x;
    player.y = GROUND_Y - PLAYER.height;
    player.vy = 0;
    player.onGround = true;
    obstacles = [];
    bullets = [];
    score = 0;
    scrollSpeed = SCROLL_SPEED_START;
    spawnTimer = 0;
  }

  function startGame() {
    resetGame();
    state = 'running';
    tPrev = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    state = 'gameover';
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('logoRunnerHiScore', String(hiScore));
      hiScoreEl.textContent = `Best: ${hiScore}`;
    }
  }

  // Input
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'idle') startGame();
      else if (state === 'running') jump();
      else if (state === 'gameover') startGame();
    } else if (e.key === 'r' || e.key === 'R') {
      if (state === 'gameover' || state === 'idle') startGame();
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'running') return;
    shoot(e);
  });

  startBtn.addEventListener('click', () => {
    if (state !== 'running') startGame();
  });

  logoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      playerImage = img;
      URL.revokeObjectURL(url);
      toast('Logo loaded!');
    };
    img.onerror = () => {
      toast('Failed to load image, using default');
    };
    img.src = url;
  });

  function jump() {
    if (player.onGround) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
    }
  }

  function shoot(ev) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;
    // bullet spawns from player's center
    const originX = player.x + player.width * 0.8;
    const originY = player.y + player.height * 0.5;
    const dx = mouseX - originX;
    const dy = mouseY - originY;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * BULLET_SPEED;
    const vy = (dy / len) * BULLET_SPEED;
    bullets.push({ x: originX, y: originY, dx: vx, dy: vy, active: true });
  }

  // Update and render
  function loop(tNow) {
    if (state !== 'running') return;
    const dt = Math.min((tNow - tPrev) / 1000, 0.033);
    tPrev = tNow;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  function update(dt) {
    // Speed ramps up slowly
    scrollSpeed += SCROLL_ACCEL_PER_S * dt;

    // Player physics
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y + player.height >= GROUND_Y) {
      player.y = GROUND_Y - player.height;
      player.vy = 0;
      player.onGround = true;
    }

    // Spawn obstacles
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const kind = Math.random() < 0.6 ? 'ground' : 'air';
      if (kind === 'ground') {
        const h = 30 + Math.random() * 20;
        obstacles.push({ x: WORLD.width + 20, y: GROUND_Y - h, width: 20 + Math.random() * 20, height: h, type: 'ground' });
        spawnTimer = 0.9 + Math.random() * 0.7;
      } else {
        const y = 100 + Math.random() * 100; // floating height
        obstacles.push({ x: WORLD.width + 20, y, width: 26, height: 20, type: 'air' });
        spawnTimer = 0.9 + Math.random() * 0.7;
      }
    }

    // Move obstacles and check player collision
    for (const obs of obstacles) {
      obs.x -= scrollSpeed * dt;
      if (rectsOverlap({ x: player.x, y: player.y, width: player.width, height: player.height }, obs)) {
        endGame();
      }
    }
    obstacles = obstacles.filter(o => o.x + o.width > -40 && !o.hit);

    // Bullets
    for (const b of bullets) {
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      if (b.x < -10 || b.x > WORLD.width + 10 || b.y < -10 || b.y > WORLD.height + 10) {
        b.active = false;
      }
      for (const obs of obstacles) {
        if (!obs.hit && obs.type === 'air') {
          if (b.x >= obs.x && b.x <= obs.x + obs.width && b.y >= obs.y && b.y <= obs.y + obs.height) {
            obs.hit = true;
            b.active = false;
            score += 50; // reward for shooting
          }
        }
      }
    }
    bullets = bullets.filter(b => b.active);

    // Score over time
    score += Math.floor(scrollSpeed * dt * 0.1);
    scoreEl.textContent = `Score: ${score}`;
  }

  function render() {
    // Sky
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    // Ground line
    ctx.strokeStyle = '#2b4b2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 0.5);
    ctx.lineTo(WORLD.width, GROUND_Y + 0.5);
    ctx.stroke();

    // Parallax clouds
    drawClouds();

    // Player
    drawPlayer();

    // Obstacles
    for (const obs of obstacles) {
      if (obs.type === 'ground') {
        ctx.fillStyle = '#2f2f2f';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      } else {
        // flying drone-like
        ctx.fillStyle = obs.hit ? 'rgba(220,0,0,0.3)' : '#444';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.fillStyle = '#88c';
        ctx.fillRect(obs.x + 4, obs.y + 6, 6, 6);
      }
    }

    // Bullets
    ctx.fillStyle = '#fbbf24';
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state === 'idle') drawCenterText('Press Start or Space');
    if (state === 'gameover') drawCenterText('Game Over - Press Space or R');
  }

  function drawPlayer() {
    const w = player.width;
    const h = player.height;
    const scale = Math.min(w, h);
    try {
      ctx.drawImage(playerImage, player.x, player.y, w, h);
    } catch (_) {
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(player.x, player.y, w, h);
    }
  }

  function drawClouds() {
    const t = performance.now() * 0.0001;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const cloudY = 60;
    for (let i = 0; i < 4; i++) {
      const x = (WORLD.width - ((t * (60 + i * 20)) % (WORLD.width + 200))) - 100;
      ctx.beginPath();
      ctx.ellipse(x, cloudY + i * 8, 30, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 20, cloudY + i * 8 + 4, 24, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 18, cloudY + i * 8 + 6, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCenterText(msg) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(WORLD.width/2 - 160, WORLD.height/2 - 40, 320, 80);
    ctx.fillStyle = 'white';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, WORLD.width/2, WORLD.height/2 + 6);
    ctx.textAlign = 'left';
  }

  function toast(message) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.top = '12px';
    });
    setTimeout(() => {
      t.remove();
    }, 1500);
  }

  // Initial render
  render();
})();
