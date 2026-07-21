"use strict";

const menuToggle = document.querySelector(".menu-toggle");
const primaryNav = document.querySelector("#primary-nav");
const board = document.querySelector("#game-board");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const statusElement = document.querySelector("#game-status");
const startButton = document.querySelector("#start-game");
const pauseButton = document.querySelector("#pause-game");

if (menuToggle && primaryNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = primaryNav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  primaryNav.addEventListener("click", (event) => {
    if (event.target.matches("a")) {
      primaryNav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const BOARD_SIZE = 25;
const CELLS_PER_SECOND = 6;
const MOVE_INTERVAL = 1000 / CELLS_PER_SECOND;
const TERRAIN_INTERVAL = 10000;
const TERRAIN_LIFETIME = 4000;
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const cells = [];
let snake = [];
let direction = DIRECTIONS.right;
let nextDirection = DIRECTIONS.right;
let food = null;
let terrain = new Set();
let moveTimer = null;
let terrainTimer = null;
let terrainExpiryTimer = null;
let gameState = "ready";
let score = 0;
let bestScore = readBestScore();

function readBestScore() {
  try {
    return Number.parseInt(window.localStorage.getItem("snake-best-score") || "0", 10) || 0;
  } catch (error) {
    return 0;
  }
}

function writeBestScore() {
  try {
    window.localStorage.setItem("snake-best-score", String(bestScore));
  } catch (error) {
    // A private browsing context may deny storage; the current score still works.
  }
}

function keyFor(point) {
  return `${point.x},${point.y}`;
}

function isInside(point) {
  return point.x >= 0 && point.x < BOARD_SIZE && point.y >= 0 && point.y < BOARD_SIZE;
}

function isOccupied(point, includeFood = true) {
  const key = keyFor(point);
  return snake.some((segment) => keyFor(segment) === key) || terrain.has(key) || (includeFood && food && keyFor(food) === key);
}

function buildBoard() {
  if (!board) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const cell = document.createElement("span");
    cell.className = "game-cell";
    cell.setAttribute("aria-hidden", "true");
    cells.push(cell);
    fragment.appendChild(cell);
  }
  board.appendChild(fragment);
}

function clearTimers() {
  window.clearInterval(moveTimer);
  window.clearInterval(terrainTimer);
  window.clearTimeout(terrainExpiryTimer);
  moveTimer = null;
  terrainTimer = null;
  terrainExpiryTimer = null;
}

function resetGame() {
  clearTimers();
  const middle = Math.floor(BOARD_SIZE / 2);
  snake = [
    { x: middle, y: middle },
    { x: middle - 1, y: middle },
    { x: middle - 2, y: middle },
  ];
  direction = DIRECTIONS.right;
  nextDirection = DIRECTIONS.right;
  terrain = new Set();
  score = 0;
  food = findOpenCell();
  gameState = "ready";
  updateHud("READY");
  render();
}

function findOpenCell() {
  const openCells = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const point = { x, y };
      if (!isOccupied(point)) openCells.push(point);
    }
  }
  return openCells.length ? openCells[Math.floor(Math.random() * openCells.length)] : null;
}

function render() {
  cells.forEach((cell, index) => {
    const point = { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
    const key = keyFor(point);
    cell.className = "game-cell";
    if (terrain.has(key)) cell.classList.add("terrain");
    if (food && key === keyFor(food)) cell.classList.add("food");
    const snakeIndex = snake.findIndex((segment) => keyFor(segment) === key);
    if (snakeIndex !== -1) {
      cell.classList.add("snake");
      if (snakeIndex === 0) cell.classList.add("snake-head");
    }
  });
}

function updateHud(status = gameState.toUpperCase()) {
  if (scoreElement) scoreElement.textContent = String(score).padStart(3, "0");
  if (bestScoreElement) bestScoreElement.textContent = String(bestScore).padStart(3, "0");
  if (statusElement) statusElement.textContent = status;
  if (pauseButton) pauseButton.disabled = gameState !== "running" && gameState !== "paused";
  if (startButton) startButton.textContent = gameState === "running" ? "Restart game" : "Start game";
}

function startGame() {
  resetGame();
  gameState = "running";
  updateHud("RUNNING");
  moveTimer = window.setInterval(step, MOVE_INTERVAL);
  terrainTimer = window.setInterval(spawnTerrain, TERRAIN_INTERVAL);
  render();
}

function togglePause() {
  if (gameState === "running") {
    gameState = "paused";
    updateHud("PAUSED");
  } else if (gameState === "paused") {
    gameState = "running";
    updateHud("RUNNING");
  }
}

function gameOver() {
  clearTimers();
  gameState = "over";
  if (score > bestScore) {
    bestScore = score;
    writeBestScore();
  }
  updateHud("GAME OVER · R TO RESTART");
}

function step() {
  if (gameState !== "running") return;
  direction = nextDirection;
  const head = snake[0];
  const nextHead = { x: head.x + direction.x, y: head.y + direction.y };
  const hitsSnake = snake.some((segment) => keyFor(segment) === keyFor(nextHead));
  if (!isInside(nextHead) || hitsSnake || terrain.has(keyFor(nextHead))) {
    gameOver();
    return;
  }

  snake.unshift(nextHead);
  if (food && keyFor(nextHead) === keyFor(food)) {
    score += 10;
    food = findOpenCell();
  } else {
    snake.pop();
  }
  render();
}

function spawnTerrain() {
  if (gameState !== "running") return;
  const head = snake[0];
  let safeTerrain = new Set();
  for (let layoutAttempt = 0; layoutAttempt < 20 && safeTerrain.size < 8; layoutAttempt += 1) {
    const candidateTerrain = new Set();
    let attempts = 0;
    while (candidateTerrain.size < 8 && attempts < 800) {
      attempts += 1;
      const candidate = { x: Math.floor(Math.random() * BOARD_SIZE), y: Math.floor(Math.random() * BOARD_SIZE) };
      const candidateKey = keyFor(candidate);
      const farEnough = Math.abs(candidate.x - head.x) + Math.abs(candidate.y - head.y) > 4;
      const overlapsSnake = snake.some((segment) => keyFor(segment) === candidateKey);
      const overlapsFood = food && keyFor(food) === candidateKey;
      if (farEnough && !candidateTerrain.has(candidateKey) && !overlapsSnake && !overlapsFood) candidateTerrain.add(candidateKey);
    }
    if (hasSafeRoute(candidateTerrain)) safeTerrain = candidateTerrain;
  }
  terrain = safeTerrain;
  render();
  window.clearTimeout(terrainExpiryTimer);
  terrainExpiryTimer = window.setTimeout(() => {
    terrain = new Set();
    render();
  }, TERRAIN_LIFETIME);
}

function hasSafeRoute(candidateTerrain) {
  if (!snake[0]) return false;
  const queue = [snake[0]];
  const visited = new Set([keyFor(snake[0])]);
  const body = new Set(snake.slice(1).map(keyFor));
  while (queue.length) {
    const point = queue.shift();
    for (const delta of Object.values(DIRECTIONS)) {
      const next = { x: point.x + delta.x, y: point.y + delta.y };
      const nextKey = keyFor(next);
      if (!isInside(next) || visited.has(nextKey) || candidateTerrain.has(nextKey) || body.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }
  return visited.size >= BOARD_SIZE;
}

function setDirection(name) {
  const requested = DIRECTIONS[name];
  if (!requested || gameState !== "running") return;
  const reversesCurrent = requested.x + direction.x === 0 && requested.y + direction.y === 0;
  const reversesQueued = requested.x + nextDirection.x === 0 && requested.y + nextDirection.y === 0;
  if (reversesCurrent || reversesQueued) return;
  nextDirection = requested;
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  const keyDirections = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
  if (keyDirections[key]) {
    event.preventDefault();
    setDirection(keyDirections[key]);
  } else if (key === "p") {
    togglePause();
  } else if (key === "r") {
    startGame();
  }
}

buildBoard();
resetGame();
window.addEventListener("keydown", handleKeydown, { passive: false });
startButton?.addEventListener("click", startGame);
pauseButton?.addEventListener("click", togglePause);
document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.direction));
});

document.documentElement.dataset.js = "ready";
