"use strict";

const WORKER_COST = 12;
const SOLDIER_COST = 22;
const WORKER_COOLDOWN = 4.25;
const SOLDIER_COOLDOWN = 8;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);

class SoundManager {
  constructor() {
    this.enabled = true;
  }

  play(name) {
    if (!this.enabled) {
      return;
    }
    // Placeholder for future sound effects.
    // Later this can trigger Web Audio oscillators or sample playback.
    void name;
  }
}

class Obstacle {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
  }

  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;

    ctx.save();
    ctx.fillStyle = "#4a3528";
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7b5b45";
    ctx.beginPath();
    ctx.arc(sx - 4, sy - 4, this.radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class FoodSource {
  constructor(x, y, amount = 50) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.radius = 16 + amount * 0.14;
  }

  harvest(value) {
    const taken = Math.min(this.amount, value);
    this.amount -= taken;
    this.radius = 16 + this.amount * 0.14;
    return taken;
  }

  get depleted() {
    return this.amount <= 0;
  }

  draw(ctx, camera, time) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const glow = 2 + Math.sin(time * 4 + this.x * 0.03) * 1.5;

    ctx.save();
    ctx.fillStyle = "rgba(113, 225, 114, 0.18)";
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius + 10 + glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#82dc68";
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#caff9b";
    ctx.beginPath();
    ctx.arc(sx - this.radius * 0.22, sy - this.radius * 0.18, this.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Entity {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 8;
    this.health = 10;
    this.maxHealth = 10;
    this.dead = false;
    this.flash = 0;
    this.velocityBlend = 7;
  }

  takeDamage(amount) {
    this.health -= amount;
    this.flash = 0.18;
    if (this.health <= 0) {
      this.dead = true;
    }
  }

  steerToward(targetX, targetY, speed, dt) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const desiredX = (dx / len) * speed;
    const desiredY = (dy / len) * speed;
    const blend = clamp(dt * this.velocityBlend, 0, 1);
    this.vx = lerp(this.vx, desiredX, blend);
    this.vy = lerp(this.vy, desiredY, blend);
  }

  applySeparation(neighbors, radius, force, dt) {
    let pushX = 0;
    let pushY = 0;
    let count = 0;

    for (const entity of neighbors) {
      if (entity === this || entity.dead) {
        continue;
      }
      const dx = this.x - entity.x;
      const dy = this.y - entity.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < radius) {
        pushX += dx / d;
        pushY += dy / d;
        count += 1;
      }
    }

    if (count > 0) {
      const len = Math.hypot(pushX, pushY) || 1;
      this.vx += (pushX / len) * force * dt;
      this.vy += (pushY / len) * force * dt;
    }
  }

  avoidObstacles(obstacles, padding, force, dt) {
    let pushX = 0;
    let pushY = 0;

    for (const obstacle of obstacles) {
      const dx = this.x - obstacle.x;
      const dy = this.y - obstacle.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const safeRange = obstacle.radius + this.radius + padding;
      if (d < safeRange) {
        const strength = (safeRange - d) / safeRange;
        pushX += (dx / d) * strength;
        pushY += (dy / d) * strength;
      }
    }

    const len = Math.hypot(pushX, pushY);
    if (len > 0) {
      this.vx += (pushX / len) * force * dt;
      this.vy += (pushY / len) * force * dt;
    }
  }

  move(dt, game, padding = 26) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, padding, game.world.width - padding);
    this.y = clamp(this.y, padding, game.world.height - padding);
  }
}

class Ant extends Entity {
  constructor(game, x, y) {
    super(x, y);
    this.game = game;
    this.attackCooldown = 0;
    this.heading = rand(0, Math.PI * 2);
    this.wobble = rand(0.8, 1.4);
  }

  updateTimers(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
  }

  updateHeading() {
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.05) {
      this.heading = Math.atan2(this.vy, this.vx);
    }
  }

  applyLocalSteering(dt) {
    this.applySeparation(this.game.ants, 15, 42, dt);
    this.avoidObstacles(this.game.obstacles, 18, 72, dt);
  }

  drawHealthBar(ctx, camera, width = 20, offset = 13) {
    if (this.health >= this.maxHealth) {
      return;
    }
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const ratio = clamp(this.health / this.maxHealth, 0, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(sx - width / 2, sy - offset, width, 3);
    ctx.fillStyle = ratio > 0.4 ? "#85df85" : "#ff7068";
    ctx.fillRect(sx - width / 2, sy - offset, width * ratio, 3);
  }
}

class WorkerAnt extends Ant {
  constructor(game, x, y) {
    super(game, x, y);
    this.type = "worker";
    this.state = "SEARCHING";
    this.radius = 5;
    this.speed = 60;
    this.health = 18;
    this.maxHealth = 18;
    this.carryAmount = 0;
    this.targetFood = null;
    this.pickupCooldown = 0;
    this.searchAnchor = { x: x + rand(-90, 90), y: y + rand(-90, 90) };
  }

  chooseFoodTarget() {
    let best = null;
    let bestScore = Infinity;

    for (const food of this.game.foodSources) {
      const d = distance(this, food);
      if (d > 360) {
        continue;
      }
      const foodScent = this.game.getFoodScentDirection(food.x, food.y);
      const pheromone = this.game.getPheromoneValue(food.x, food.y);
      const score = d - pheromone * 20 - foodScent * 35;
      if (score < bestScore) {
        bestScore = score;
        best = food;
      }
    }

    return best;
  }

  wander(dt) {
    const toAnchor = distance(this, this.searchAnchor);
    if (toAnchor < 24 || toAnchor > 190) {
      const scentDir = this.game.getPheromoneDirection(this.x, this.y);
      this.searchAnchor = {
        x: this.x + rand(-120, 120) + scentDir.x * 40,
        y: this.y + rand(-120, 120) + scentDir.y * 40
      };
    }

    const pheromone = this.game.getPheromoneDirection(this.x, this.y);
    const intensity = this.game.getPheromoneValue(this.x, this.y);
    const targetX = this.searchAnchor.x + pheromone.x * (35 + intensity * 9);
    const targetY = this.searchAnchor.y + pheromone.y * (35 + intensity * 9);

    this.steerToward(targetX, targetY, this.speed, dt);
    this.applyLocalSteering(dt);
  }

  update(dt) {
    // Worker finite state machine: search, collect, then return to the nest.
    this.updateTimers(dt);
    this.pickupCooldown = Math.max(0, this.pickupCooldown - dt);

    if (!this.targetFood || this.targetFood.depleted) {
      this.targetFood = null;
      if (this.state === "COLLECTING") {
        this.state = "SEARCHING";
      }
    }

    if (this.state === "SEARCHING") {
      this.targetFood = this.chooseFoodTarget();
      if (this.targetFood) {
        this.state = "COLLECTING";
      } else {
        this.wander(dt);
      }
    }

    if (this.state === "COLLECTING" && this.targetFood) {
      this.steerToward(this.targetFood.x, this.targetFood.y, this.speed + 18, dt);
      this.applyLocalSteering(dt);
      if (distance(this, this.targetFood) < this.targetFood.radius + 5 && this.pickupCooldown <= 0) {
        this.carryAmount = this.targetFood.harvest(1);
        this.pickupCooldown = 0.18;
        this.state = this.carryAmount > 0 ? "RETURNING" : "SEARCHING";
        if (this.targetFood.depleted) {
          this.game.addMessage("A food patch has been exhausted.");
        }
      }
    }

    if (this.state === "RETURNING") {
      this.steerToward(this.game.nest.x, this.game.nest.y, this.speed + 20, dt);
      this.applyLocalSteering(dt);
      this.game.depositPheromone(this.x, this.y, 0.95);
      if (distance(this, this.game.nest) < this.game.nest.radius + 12) {
        this.game.food += this.carryAmount;
        this.game.sound.play("food-drop");
        this.carryAmount = 0;
        this.targetFood = null;
        this.state = "SEARCHING";
      }
    }

    this.updateHeading();
    this.move(dt, this.game);
  }

  draw(ctx, camera, time) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const legSwing = Math.sin(time * 15 * this.wobble) * 2;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.heading);

    ctx.strokeStyle = "rgba(26, 16, 9, 0.45)";
    ctx.lineWidth = 1.3;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-2, i * 2);
      ctx.lineTo(-7, i * 4 + legSwing);
      ctx.moveTo(2, i * 2);
      ctx.lineTo(7, i * 4 - legSwing);
      ctx.stroke();
    }

    ctx.fillStyle = this.flash > 0 ? "#fff0cb" : "#31231a";
    ctx.beginPath();
    ctx.ellipse(-4.5, 0, 3, 2.6, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, 3.6, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(5.5, 0, 3, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#c48a4e";
    ctx.beginPath();
    ctx.arc(6.5, -1, 1.2, 0, Math.PI * 2);
    ctx.arc(6.5, 1, 1.2, 0, Math.PI * 2);
    ctx.fill();

    if (this.carryAmount > 0) {
      ctx.fillStyle = "#96ff88";
      ctx.beginPath();
      ctx.arc(3, -6, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    this.drawHealthBar(ctx, camera, 16, 12);
  }
}

class SoldierAnt extends Ant {
  constructor(game, x, y) {
    super(game, x, y);
    this.type = "soldier";
    this.state = "IDLE";
    this.radius = 8;
    this.speed = 69;
    this.health = 48;
    this.maxHealth = 48;
    this.damage = 9;
    this.detectionRadius = 230;
    this.attackRange = 18;
    this.targetEnemy = null;
    this.patrolAngle = rand(0, Math.PI * 2);
    this.patrolRadius = rand(60, 120);
  }

  chooseEnemy() {
    let best = null;
    let bestScore = Infinity;
    for (const enemy of this.game.enemies) {
      const d = distance(this, enemy);
      if (d > this.detectionRadius) {
        continue;
      }
      const queenWeight = distance(enemy, this.game.queen) * 0.4;
      const score = d + queenWeight;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  update(dt) {
    // Soldier finite state machine: patrol near the nest, then chase and attack threats.
    this.updateTimers(dt);

    if (!this.targetEnemy || this.targetEnemy.dead) {
      this.targetEnemy = null;
      this.state = "IDLE";
    }

    const seenEnemy = this.chooseEnemy();
    if (seenEnemy) {
      this.targetEnemy = seenEnemy;
      this.state = "CHASING";
    }

    if (this.state === "IDLE") {
      this.patrolAngle += dt * (0.7 + this.wobble * 0.08);
      const px = this.game.nest.x + Math.cos(this.patrolAngle) * this.patrolRadius;
      const py = this.game.nest.y + Math.sin(this.patrolAngle) * this.patrolRadius;
      this.steerToward(px, py, this.speed * 0.66, dt);
      this.applyLocalSteering(dt);
    }

    if (this.state === "CHASING" && this.targetEnemy) {
      this.steerToward(this.targetEnemy.x, this.targetEnemy.y, this.speed + 18, dt);
      this.applyLocalSteering(dt);
      if (distance(this, this.targetEnemy) < this.attackRange) {
        this.state = "ATTACKING";
      }
    }

    if (this.state === "ATTACKING" && this.targetEnemy) {
      this.steerToward(this.targetEnemy.x, this.targetEnemy.y, this.speed * 0.45, dt);
      this.applyLocalSteering(dt);
      if (distance(this, this.targetEnemy) > this.attackRange + 10) {
        this.state = "CHASING";
      } else if (this.attackCooldown <= 0) {
        this.targetEnemy.takeDamage(this.damage);
        this.attackCooldown = 0.42;
        this.game.sound.play("soldier-hit");
        this.game.spawnHitEffect(this.targetEnemy.x, this.targetEnemy.y, "#ffd570", "slash");
      }
    }

    this.updateHeading();
    this.move(dt, this.game);
  }

  draw(ctx, camera, time) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const legSwing = Math.sin(time * 14 * this.wobble) * 2.6;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.heading);

    ctx.strokeStyle = "rgba(23, 13, 8, 0.55)";
    ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-2, i * 2.5);
      ctx.lineTo(-8, i * 4.2 + legSwing);
      ctx.moveTo(3, i * 2.5);
      ctx.lineTo(9, i * 4.2 - legSwing);
      ctx.stroke();
    }

    ctx.fillStyle = this.flash > 0 ? "#fff0cb" : "#241814";
    ctx.beginPath();
    ctx.ellipse(-5.5, 0, 4, 3.3, 0, 0, Math.PI * 2);
    ctx.ellipse(0.5, 0, 4.6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(7, 0, 3.9, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f2a256";
    ctx.beginPath();
    ctx.arc(8.5, -1.5, 1.6, 0, Math.PI * 2);
    ctx.arc(8.5, 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    this.drawHealthBar(ctx, camera, 20, 14);
  }
}

class Enemy extends Entity {
  constructor(game, x, y, wave, archetype) {
    super(x, y);
    this.game = game;
    this.type = archetype.type;
    this.color = archetype.color;
    this.speed = archetype.speed + wave * archetype.speedScale;
    this.health = archetype.health + wave * archetype.healthScale;
    this.maxHealth = this.health;
    this.damage = archetype.damage + wave * archetype.damageScale;
    this.radius = archetype.radius;
    this.attackCooldown = rand(0.08, 0.25);
    this.velocityBlend = archetype.velocityBlend;
    this.priority = archetype.priority;
    this.targetPreference = archetype.targetPreference;
  }

  chooseTarget() {
    let best = null;
    let bestScore = Infinity;

    for (const ant of this.game.ants) {
      const d = distance(this, ant);
      if (d > 120) {
        continue;
      }
      if (d < bestScore) {
        bestScore = d;
        best = ant;
      }
    }

    if (best) {
      return best;
    }

    if (this.targetPreference === "queen") {
      return this.game.queen;
    }

    return this.game.nest;
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const target = this.chooseTarget();
    const isStructure = target === this.game.nest || target === this.game.queen;
    const speedBoost = this.game.isNight ? 18 : 0;
    this.steerToward(target.x, target.y, this.speed + speedBoost, dt);
    this.applySeparation(this.game.enemies, 22, 28, dt);
    this.avoidObstacles(this.game.obstacles, 20, 88, dt);

    const attackRange = isStructure ? this.radius + target.radius + 4 : this.radius + target.radius + 4;
    if (distance(this, target) < attackRange && this.attackCooldown <= 0) {
      target.takeDamage(this.damage);
      this.attackCooldown = this.type === "scout" ? 0.55 : this.type === "beetle" ? 1.1 : 0.8;
      this.game.sound.play("enemy-hit");
      this.game.spawnHitEffect(target.x, target.y, "#ff7868", "impact");
    }

    this.move(dt, this.game, 10);
  }

  draw(ctx, camera, time) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const legSwing = Math.sin(time * 10 * 1.1) * 2.8;
    const angle = Math.atan2(this.vy || 0.001, this.vx || 1);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);

    ctx.strokeStyle = "rgba(38, 8, 8, 0.58)";
    ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-3, i * 2.8);
      ctx.lineTo(-10, i * 5 + legSwing);
      ctx.moveTo(2, i * 2.8);
      ctx.lineTo(10, i * 5 - legSwing);
      ctx.stroke();
    }

    ctx.fillStyle = this.flash > 0 ? "#fff3dc" : this.color;
    ctx.beginPath();
    ctx.ellipse(-6, 0, this.radius * 0.42, this.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(1, 0, this.radius * 0.54, this.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(9, 0, this.radius * 0.4, this.radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    this.drawHealthBar(ctx, camera);
  }

  drawHealthBar(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const ratio = clamp(this.health / this.maxHealth, 0, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(sx - 14, sy - 18, 28, 4);
    ctx.fillStyle = ratio > 0.45 ? "#8ddd7d" : "#ff7068";
    ctx.fillRect(sx - 14, sy - 18, 28 * ratio, 4);
  }
}

class QueenAnt extends Entity {
  constructor(game, x, y) {
    super(x, y);
    this.game = game;
    this.radius = 18;
    this.health = 120;
    this.maxHealth = 120;
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    void dt;
  }

  draw(ctx, camera, time) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y + Math.sin(time * 2.2) * 1.2;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = this.flash > 0 ? "#fff0d1" : "#59301d";
    ctx.beginPath();
    ctx.ellipse(-14, 0, 9, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(18, 0, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0bc62";
    ctx.beginPath();
    ctx.arc(10, -4, 2.2, 0, Math.PI * 2);
    ctx.arc(10, 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const ratio = clamp(this.health / this.maxHealth, 0, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(sx - 28, sy - 30, 56, 5);
    ctx.fillStyle = ratio > 0.45 ? "#90e48d" : "#ff7268";
    ctx.fillRect(sx - 28, sy - 30, 56 * ratio, 5);
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.sound = new SoundManager();

    this.ui = {
      food: document.getElementById("foodCount"),
      workers: document.getElementById("workerCount"),
      soldiers: document.getElementById("soldierCount"),
      enemies: document.getElementById("enemyCount"),
      health: document.getElementById("nestHealth"),
      queenHealth: document.getElementById("queenHealth"),
      phaseLabel: document.getElementById("phaseLabel"),
      phaseTimer: document.getElementById("phaseTimer"),
      waveTimer: document.getElementById("waveTimer"),
      time: document.getElementById("survivalTime"),
      goal: document.getElementById("goalText"),
      queenAura: document.getElementById("queenAura"),
      status: document.getElementById("gameStateLabel"),
      selection: document.getElementById("selectionStatus"),
      overlayMessage: document.getElementById("overlayMessage"),
      workerButton: document.getElementById("spawnWorkerButton"),
      soldierButton: document.getElementById("spawnSoldierButton"),
      workerCooldownLabel: document.getElementById("workerCooldownLabel"),
      soldierCooldownLabel: document.getElementById("soldierCooldownLabel"),
      workerCooldownFill: document.getElementById("workerCooldownFill"),
      soldierCooldownFill: document.getElementById("soldierCooldownFill"),
      waveBadge: document.getElementById("waveBadge"),
      screenOverlay: document.getElementById("screenOverlay"),
      screenKicker: document.getElementById("screenKicker"),
      screenTitle: document.getElementById("screenTitle"),
      screenDescription: document.getElementById("screenDescription"),
      primaryScreenButton: document.getElementById("primaryScreenButton"),
      secondaryScreenButton: document.getElementById("secondaryScreenButton")
    };

    this.keys = new Set();
    this.time = 0;
    this.lastTime = performance.now();

    this.world = { width: 2800, height: 1900 };
    this.goalFood = 340;
    this.survivalGoal = 330;
    this.cycleDuration = 60;
    this.enemyArchetypes = [
      {
        type: "scout",
        color: "#b53d2d",
        speed: 56,
        speedScale: 1.7,
        health: 18,
        healthScale: 2,
        damage: 5,
        damageScale: 0.5,
        radius: 9,
        velocityBlend: 6,
        priority: 1,
        targetPreference: "queen"
      },
      {
        type: "raider",
        color: "#7d2318",
        speed: 42,
        speedScale: 1.3,
        health: 28,
        healthScale: 4,
        damage: 7,
        damageScale: 0.7,
        radius: 10,
        velocityBlend: 5,
        priority: 2,
        targetPreference: "nest"
      },
      {
        type: "beetle",
        color: "#523626",
        speed: 28,
        speedScale: 0.8,
        health: 54,
        healthScale: 8,
        damage: 11,
        damageScale: 1,
        radius: 13,
        velocityBlend: 4,
        priority: 3,
        targetPreference: "nest"
      }
    ];

    this.registerUiEvents();
    this.resizeCanvas();
    this.resetGameState();
    this.showStartScreen();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  resetGameState() {
    this.nest = {
      x: this.world.width / 2,
      y: this.world.height / 2,
      radius: 48,
      health: 200,
      maxHealth: 200,
      flash: 0,
      takeDamage(amount) {
        this.health = clamp(this.health - amount, 0, this.maxHealth);
        this.flash = 0.24;
      }
    };

    this.queen = new QueenAnt(this, this.nest.x, this.nest.y + 8);
    this.camera = {
      x: this.nest.x - this.canvas.width / 2,
      y: this.nest.y - this.canvas.height / 2,
      speed: 380
    };

    this.food = 46;
    this.gameTime = 0;
    this.wave = 0;
    this.waveCooldown = 8;
    this.activeWave = null;
    this.phaseTime = 0;
    this.isNight = false;
    this.running = false;
    this.hasStarted = false;
    this.win = false;
    this.selectedNest = true;
    this.messageTimer = 0;
    this.pendingScreenMode = "start";
    this.pausedForHelp = false;
    this.spawnCooldowns = { worker: 0, soldier: 0 };

    this.ants = [];
    this.enemies = [];
    this.foodSources = [];
    this.effects = [];
    this.obstacles = [];
    this.pheromones = {
      cellSize: 36,
      cols: Math.ceil(this.world.width / 36),
      rows: Math.ceil(this.world.height / 36),
      grid: [],
      foodGrid: []
    };

    this.initPheromones();
    this.createObstacles(15);
    this.createFoodSources(20);
    for (let i = 0; i < 4; i += 1) {
      this.spawnAnt("worker", true, false);
    }
    for (let i = 0; i < 1; i += 1) {
      this.spawnAnt("soldier", true, false);
    }
    this.rebuildFoodScent();
    this.centerCameraOnNest(true);
    this.updateHud();
  }

  registerUiEvents() {
    window.addEventListener("resize", () => this.resizeCanvas());
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (event.code === "Space") {
        event.preventDefault();
        if (this.running) {
          this.spawnAnt("worker");
        }
      }
      if (key === "e" && this.running) {
        this.spawnAnt("soldier");
      }
      if (key === "enter" && !this.running && this.pendingScreenMode !== "help") {
        this.startOrRestart();
      }
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
    this.canvas.addEventListener("click", (event) => this.handleCanvasClick(event));
    this.ui.workerButton.addEventListener("click", () => this.spawnAnt("worker"));
    this.ui.soldierButton.addEventListener("click", () => this.spawnAnt("soldier"));
    this.ui.primaryScreenButton.addEventListener("click", () => this.handlePrimaryButton());
    this.ui.secondaryScreenButton.addEventListener("click", () => this.handleSecondaryButton());
  }

  resizeCanvas() {
    const frame = this.canvas.parentElement;
    const width = Math.min(frame.clientWidth, 1280);
    const height = Math.round(width * 0.5625);
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.camera) {
      this.camera.x = clamp(this.camera.x, 0, this.world.width - this.canvas.width);
      this.camera.y = clamp(this.camera.y, 0, this.world.height - this.canvas.height);
    }
  }

  initPheromones() {
    this.pheromones.grid = Array.from(
      { length: this.pheromones.rows },
      () => Array(this.pheromones.cols).fill(0)
    );
    this.pheromones.foodGrid = Array.from(
      { length: this.pheromones.rows },
      () => Array(this.pheromones.cols).fill(0)
    );
  }

  rebuildFoodScent() {
    for (let row = 0; row < this.pheromones.rows; row += 1) {
      this.pheromones.foodGrid[row].fill(0);
    }
    for (const food of this.foodSources) {
      const cx = Math.floor(food.x / this.pheromones.cellSize);
      const cy = Math.floor(food.y / this.pheromones.cellSize);
      for (let oy = -3; oy <= 3; oy += 1) {
        for (let ox = -3; ox <= 3; ox += 1) {
          const row = this.pheromones.foodGrid[cy + oy];
          if (!row || row[cx + ox] === undefined) {
            continue;
          }
          const d = Math.hypot(ox, oy) || 1;
          row[cx + ox] += Math.max(0, 1.6 - d * 0.32);
        }
      }
    }
  }

  createObstacles(count) {
    let attempts = 0;
    while (this.obstacles.length < count && attempts < count * 20) {
      attempts += 1;
      const obstacle = new Obstacle(rand(120, this.world.width - 120), rand(120, this.world.height - 120), rand(24, 42));
      if (distance(obstacle, this.nest) < 190) {
        continue;
      }
      if (this.obstacles.some((other) => distance(obstacle, other) < obstacle.radius + other.radius + 40)) {
        continue;
      }
      this.obstacles.push(obstacle);
    }
  }

  validSpawnLocation(x, y, clearance) {
    return !this.obstacles.some((obstacle) => distance({ x, y }, obstacle) < obstacle.radius + clearance);
  }

  createFoodSources(count) {
    let attempts = 0;
    while (count > 0 && attempts < 400) {
      attempts += 1;
      const angle = rand(0, Math.PI * 2);
      const radius = rand(200, 1120);
      const x = clamp(this.nest.x + Math.cos(angle) * radius, 90, this.world.width - 90);
      const y = clamp(this.nest.y + Math.sin(angle) * radius, 90, this.world.height - 90);
      if (!this.validSpawnLocation(x, y, 60)) {
        continue;
      }
      this.foodSources.push(new FoodSource(x, y, rand(28, 58)));
      count -= 1;
    }
  }

  showScreen(mode, title, description, primaryLabel, secondaryLabel) {
    this.pendingScreenMode = mode;
    this.ui.screenKicker.textContent =
      mode === "start" ? "Queen's Orders" :
      mode === "help" ? "Field Manual" :
      mode === "win" ? "Colony Thriving" :
      "Nest in Peril";
    this.ui.screenTitle.textContent = title;
    this.ui.screenDescription.textContent = description;
    this.ui.primaryScreenButton.textContent = primaryLabel;
    this.ui.secondaryScreenButton.textContent = secondaryLabel;
    this.ui.screenOverlay.classList.add("visible");
  }

  hideScreen() {
    this.ui.screenOverlay.classList.remove("visible");
  }

  showStartScreen() {
    this.showScreen(
      "start",
      "Guide the queen through the full survival cycle",
      "Food fuels brood growth, nights intensify attacks, and enemy types change the pressure on your defenses. Reach 340 food or survive 330 seconds.",
      "Start Colony",
      "How to Play"
    );
  }

  showHelpScreen() {
    const canResume = this.hasStarted && this.running;
    if (canResume) {
      this.pausedForHelp = true;
      this.running = false;
    }
    this.showScreen(
      "help",
      "How to Play",
      "Workers follow food scent and pheromones, soldiers protect the queen, and brood spawning uses both food and cooldowns. Nights make enemies faster and waves denser. Click the nest to re-center the camera.",
      canResume ? "Resume Run" : "Back",
      this.hasStarted ? "Restart Colony" : "Start Colony"
    );
  }

  showEndScreen(win) {
    this.showScreen(
      win ? "win" : "lose",
      win ? "The queen endures" : "The queen has fallen",
      win
        ? "Your colony balanced growth, defense, and survival through the shifting day-night cycle."
        : "The brood collapsed under pressure. Try pacing your spawns and meeting night waves with more soldiers.",
      "Restart Colony",
      "How to Play"
    );
  }

  handlePrimaryButton() {
    if (this.pendingScreenMode === "help") {
      if (this.pausedForHelp) {
        this.running = true;
        this.pausedForHelp = false;
        this.hideScreen();
        this.addMessage("The colony returns to work.");
      } else if (this.hasStarted) {
        this.showEndScreen(this.win);
      } else {
        this.showStartScreen();
      }
      return;
    }
    this.startOrRestart();
  }

  handleSecondaryButton() {
    if (this.pendingScreenMode === "help") {
      if (this.hasStarted) {
        this.resetGameState();
        this.startGame();
      } else {
        this.startOrRestart();
      }
      return;
    }
    this.showHelpScreen();
  }

  startOrRestart() {
    if (this.hasStarted) {
      this.resetGameState();
    }
    this.startGame();
  }

  startGame() {
    this.hasStarted = true;
    this.running = true;
    this.win = false;
    this.pausedForHelp = false;
    this.hideScreen();
    this.sound.play("start");
    this.addMessage("The queen stirs. The first scouting insects are near.");
  }

  handleCanvasClick(event) {
    if (!this.running) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX + this.camera.x;
    const y = (event.clientY - rect.top) * scaleY + this.camera.y;
    this.selectedNest = distance({ x, y }, this.nest) <= this.nest.radius + 22;
    this.ui.selection.textContent = this.selectedNest
      ? "Nest selected. The queen remains the center of your defenses."
      : "Camera free. Scan obstacles, trails, and incoming bugs.";
    if (this.selectedNest) {
      this.centerCameraOnNest(false);
    }
  }

  centerCameraOnNest(immediate) {
    const targetX = this.nest.x - this.canvas.width / 2;
    const targetY = this.nest.y - this.canvas.height / 2;
    if (immediate) {
      this.camera.x = clamp(targetX, 0, this.world.width - this.canvas.width);
      this.camera.y = clamp(targetY, 0, this.world.height - this.canvas.height);
      return;
    }
    this.camera.x = lerp(this.camera.x, targetX, 0.18);
    this.camera.y = lerp(this.camera.y, targetY, 0.18);
  }

  addMessage(text) {
    this.ui.overlayMessage.textContent = text;
    this.ui.overlayMessage.classList.add("visible");
    this.messageTimer = 2.3;
  }

  spawnHitEffect(x, y, color, kind) {
    this.effects.push({ x, y, color, kind, life: 0.42, maxLife: 0.42 });
  }

  spawnAnt(type, free = false, announce = true) {
    if (!this.running && !free) {
      return false;
    }

    const cost = type === "worker" ? WORKER_COST : SOLDIER_COST;
    const cooldownKey = type === "worker" ? "worker" : "soldier";
    const cooldownDuration = type === "worker" ? WORKER_COOLDOWN : SOLDIER_COOLDOWN;

    if (!free && this.spawnCooldowns[cooldownKey] > 0) {
      this.addMessage(`${type === "worker" ? "Worker" : "Soldier"} brood is still developing.`);
      return false;
    }
    if (!free && this.food < cost) {
      this.addMessage(`Not enough food for a ${type}.`);
      return false;
    }

    if (!free) {
      this.food -= cost;
      this.spawnCooldowns[cooldownKey] = cooldownDuration;
    }

    const angle = rand(0, Math.PI * 2);
    const radius = rand(20, 38);
    const x = this.nest.x + Math.cos(angle) * radius;
    const y = this.nest.y + Math.sin(angle) * radius;
    const ant = type === "worker" ? new WorkerAnt(this, x, y) : new SoldierAnt(this, x, y);
    this.ants.push(ant);
    if (!free) {
      this.sound.play("spawn");
    }
    if (announce) {
      this.addMessage(`${type === "worker" ? "Worker" : "Soldier"} ant spawned.`);
    }
    return true;
  }

  randomEnemyArchetype() {
    const roll = Math.random();
    if (this.wave < 2) {
      return this.enemyArchetypes[roll < 0.7 ? 1 : 0];
    }
    if (roll < 0.35) {
      return this.enemyArchetypes[0];
    }
    if (roll < 0.8) {
      return this.enemyArchetypes[1];
    }
    return this.enemyArchetypes[2];
  }

  startNextWave() {
    this.wave += 1;
    const nightBonus = this.isNight ? 3 : 0;
    const count = 5 + Math.floor(this.wave * 2.2) + nightBonus;
    const burstSize = Math.min(6, 2 + Math.floor(this.wave / 2) + nightBonus);
    const interval = clamp(1.3 - this.wave * 0.07 - nightBonus * 0.08, 0.4, 1.3);
    this.activeWave = { remaining: count, interval, spawnTimer: 0.2, burstSize };
    this.waveCooldown = clamp(15 - this.wave * 0.32, 6.5, 15);
    this.createFoodSources(1 + Math.floor(this.wave * 0.25));
    this.rebuildFoodScent();
    this.sound.play("wave");
    this.addMessage(`Wave ${this.wave} incoming${this.isNight ? " under cover of night" : ""}.`);
  }

  spawnEnemy() {
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = rand(0, this.world.width);
      y = -24;
    } else if (edge === 1) {
      x = this.world.width + 24;
      y = rand(0, this.world.height);
    } else if (edge === 2) {
      x = rand(0, this.world.width);
      y = this.world.height + 24;
    } else {
      x = -24;
      y = rand(0, this.world.height);
    }
    const archetype = this.randomEnemyArchetype();
    this.enemies.push(new Enemy(this, x, y, this.wave, archetype));
  }

  depositPheromone(x, y, amount) {
    const cellX = Math.floor(x / this.pheromones.cellSize);
    const cellY = Math.floor(y / this.pheromones.cellSize);
    const row = this.pheromones.grid[cellY];
    if (row && row[cellX] !== undefined) {
      row[cellX] = clamp(row[cellX] + amount, 0, 8);
    }
  }

  getPheromoneValue(x, y) {
    const cellX = Math.floor(x / this.pheromones.cellSize);
    const cellY = Math.floor(y / this.pheromones.cellSize);
    return this.pheromones.grid[cellY]?.[cellX] || 0;
  }

  getFoodScentDirection(x, y) {
    const cellX = Math.floor(x / this.pheromones.cellSize);
    const cellY = Math.floor(y / this.pheromones.cellSize);
    return this.pheromones.foodGrid[cellY]?.[cellX] || 0;
  }

  getPheromoneDirection(x, y) {
    const cellSize = this.pheromones.cellSize;
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    let dirX = 0;
    let dirY = 0;
    let total = 0;

    for (let oy = -2; oy <= 2; oy += 1) {
      for (let ox = -2; ox <= 2; ox += 1) {
        if (ox === 0 && oy === 0) {
          continue;
        }
        const pheromone = this.pheromones.grid[cy + oy]?.[cx + ox] || 0;
        const scent = this.pheromones.foodGrid[cy + oy]?.[cx + ox] || 0;
        const value = pheromone * 1.2 + scent * 0.5;
        if (value <= 0.08) {
          continue;
        }
        const len = Math.hypot(ox, oy) || 1;
        dirX += (ox / len) * value;
        dirY += (oy / len) * value;
        total += value;
      }
    }

    if (total <= 0) {
      return { x: 0, y: 0 };
    }
    const len = Math.hypot(dirX, dirY) || 1;
    return { x: dirX / len, y: dirY / len };
  }

  updatePheromones(dt) {
    const decay = 0.14 * dt;
    for (let rowIndex = 0; rowIndex < this.pheromones.rows; rowIndex += 1) {
      const row = this.pheromones.grid[rowIndex];
      for (let colIndex = 0; colIndex < this.pheromones.cols; colIndex += 1) {
        row[colIndex] = Math.max(0, row[colIndex] - decay);
      }
    }
  }

  updateCycle(dt) {
    this.phaseTime += dt;
    if (this.phaseTime >= this.cycleDuration) {
      this.phaseTime -= this.cycleDuration;
    }
    const nowNight = this.phaseTime >= this.cycleDuration / 2;
    if (nowNight !== this.isNight) {
      this.isNight = nowNight;
      this.sound.play(nowNight ? "night" : "day");
      this.addMessage(nowNight ? "Night falls. Enemy pressure rises." : "Day breaks. The colony regroups.");
    }
  }

  updateWaveSystem(dt) {
    if (this.activeWave) {
      this.activeWave.spawnTimer -= dt;
      if (this.activeWave.spawnTimer <= 0 && this.activeWave.remaining > 0) {
        const burst = Math.min(this.activeWave.burstSize, this.activeWave.remaining);
        for (let i = 0; i < burst; i += 1) {
          this.spawnEnemy();
        }
        this.activeWave.remaining -= burst;
        this.activeWave.spawnTimer = this.activeWave.interval;
      }
      if (this.activeWave.remaining <= 0 && this.enemies.length === 0) {
        this.activeWave = null;
        this.addMessage("Wave cleared. Reinforce the colony before the next assault.");
      }
      return;
    }
    this.waveCooldown -= dt;
    if (this.waveCooldown <= 0) {
      this.startNextWave();
    }
  }

  updateCamera(dt) {
    const moveX = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
      (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const moveY = (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) -
      (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0);
    this.camera.x += moveX * this.camera.speed * dt;
    this.camera.y += moveY * this.camera.speed * dt;
    if (moveX === 0 && moveY === 0 && this.selectedNest) {
      this.centerCameraOnNest(false);
    }
    this.camera.x = clamp(this.camera.x, 0, this.world.width - this.canvas.width);
    this.camera.y = clamp(this.camera.y, 0, this.world.height - this.canvas.height);
  }

  updateCooldowns(dt) {
    this.spawnCooldowns.worker = Math.max(0, this.spawnCooldowns.worker - dt);
    this.spawnCooldowns.soldier = Math.max(0, this.spawnCooldowns.soldier - dt);
  }

  update(dt) {
    this.time += dt;

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        this.ui.overlayMessage.classList.remove("visible");
      }
    }

    if (!this.running) {
      this.updateHud();
      return;
    }

    this.gameTime += dt;
    this.nest.flash = Math.max(0, this.nest.flash - dt);
    this.updateCooldowns(dt);
    this.updateCycle(dt);
    this.updateWaveSystem(dt);
    this.updateCamera(dt);
    this.updatePheromones(dt);

    this.queen.update(dt);
    for (const ant of this.ants) {
      ant.update(dt);
    }
    for (const enemy of this.enemies) {
      enemy.update(dt);
    }
    for (const effect of this.effects) {
      effect.life -= dt;
    }

    this.ants = this.ants.filter((ant) => !ant.dead);
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    const hadFoodCount = this.foodSources.length;
    this.foodSources = this.foodSources.filter((food) => !food.depleted);
    if (this.foodSources.length !== hadFoodCount) {
      this.rebuildFoodScent();
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);

    if (this.foodSources.length < 10) {
      this.createFoodSources(3);
      this.rebuildFoodScent();
    }

    const queenAuraValue = this.queen.health / this.queen.maxHealth;
    if (queenAuraValue < 0.4 && Math.random() < dt * 0.5) {
      this.addMessage("The queen is vulnerable. Pull soldiers back toward the nest.");
    }

    if (this.nest.health <= 0 || this.queen.health <= 0) {
      this.running = false;
      this.win = false;
      this.sound.play("lose");
      this.showEndScreen(false);
      this.addMessage(this.queen.health <= 0 ? "The queen has fallen." : "The nest collapsed.");
    } else if (this.food >= this.goalFood || this.gameTime >= this.survivalGoal) {
      this.running = false;
      this.win = true;
      this.sound.play("win");
      this.showEndScreen(true);
      this.addMessage("Victory. The colony survives the full cycle.");
    }

    this.updateHud();
  }

  updateHud() {
    const workers = this.ants.filter((ant) => ant.type === "worker").length;
    const soldiers = this.ants.filter((ant) => ant.type === "soldier").length;
    const halfCycle = this.cycleDuration / 2;
    const phaseProgress = this.isNight ? this.phaseTime - halfCycle : this.phaseTime;
    const phaseRemaining = Math.max(0, Math.ceil(halfCycle - phaseProgress));

    this.ui.food.textContent = Math.floor(this.food);
    this.ui.workers.textContent = workers;
    this.ui.soldiers.textContent = soldiers;
    this.ui.enemies.textContent = this.enemies.length;
    this.ui.health.textContent = `${Math.ceil(this.nest.health)} / ${this.nest.maxHealth}`;
    this.ui.queenHealth.textContent = `${Math.ceil(this.queen.health)} / ${this.queen.maxHealth}`;
    this.ui.phaseLabel.textContent = this.isNight ? "Night" : "Day";
    this.ui.phaseTimer.textContent = `${phaseRemaining}s`;
    this.ui.waveTimer.textContent = this.activeWave
      ? `${this.activeWave.remaining} left`
      : `${Math.max(0, Math.ceil(this.waveCooldown))}s`;
    this.ui.time.textContent = `${Math.floor(this.gameTime)}s`;
    this.ui.goal.textContent = `${Math.floor(this.food)}/${this.goalFood} food or ${this.survivalGoal}s`;
    this.ui.queenAura.textContent = this.queen.health > this.queen.maxHealth * 0.65 ? "Calm" : this.queen.health > this.queen.maxHealth * 0.3 ? "Shaken" : "Critical";
    this.ui.waveBadge.textContent = `Wave ${this.wave}`;

    if (!this.hasStarted) {
      this.ui.status.textContent = "Ready for deployment";
    } else if (!this.running) {
      this.ui.status.textContent = this.win ? "Colony thriving" : "Colony destroyed";
    } else if (this.activeWave) {
      this.ui.status.textContent = this.isNight ? "Night assault active" : "Enemy wave active";
    } else {
      this.ui.status.textContent = this.isNight ? "Night watch" : "Gather and prepare";
    }

    const workerRatio = 1 - this.spawnCooldowns.worker / WORKER_COOLDOWN;
    const soldierRatio = 1 - this.spawnCooldowns.soldier / SOLDIER_COOLDOWN;
    this.ui.workerButton.disabled = this.food < WORKER_COST || this.spawnCooldowns.worker > 0 || !this.running;
    this.ui.soldierButton.disabled = this.food < SOLDIER_COST || this.spawnCooldowns.soldier > 0 || !this.running;
    this.ui.workerCooldownLabel.textContent = this.spawnCooldowns.worker > 0 ? `${this.spawnCooldowns.worker.toFixed(1)}s` : "Ready";
    this.ui.soldierCooldownLabel.textContent = this.spawnCooldowns.soldier > 0 ? `${this.spawnCooldowns.soldier.toFixed(1)}s` : "Ready";
    this.ui.workerCooldownFill.style.transform = `scaleX(${clamp(workerRatio, 0, 1)})`;
    this.ui.soldierCooldownFill.style.transform = `scaleX(${clamp(soldierRatio, 0, 1)})`;
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    if (this.isNight) {
      gradient.addColorStop(0, "#24324f");
      gradient.addColorStop(1, "#1b1611");
    } else {
      gradient.addColorStop(0, "#57361f");
      gradient.addColorStop(1, "#26170f");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const patch = 96;
    const startX = Math.floor(this.camera.x / patch) * patch;
    const startY = Math.floor(this.camera.y / patch) * patch;
    for (let y = startY; y < this.camera.y + this.canvas.height + patch; y += patch) {
      for (let x = startX; x < this.camera.x + this.canvas.width + patch; x += patch) {
        const sx = x - this.camera.x;
        const sy = y - this.camera.y;
        const seed = Math.sin(x * 0.011 + y * 0.019);
        ctx.fillStyle = seed > 0
          ? this.isNight ? "rgba(147, 173, 214, 0.03)" : "rgba(255, 214, 149, 0.04)"
          : "rgba(24, 12, 8, 0.06)";
        ctx.beginPath();
        ctx.arc(sx + 18 + seed * 12, sy + 20 - seed * 10, 13 + Math.abs(seed) * 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawWorldBounds() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 224, 172, 0.14)";
    ctx.lineWidth = 10;
    ctx.strokeRect(-this.camera.x, -this.camera.y, this.world.width, this.world.height);
    ctx.restore();
  }

  drawPheromones() {
    const ctx = this.ctx;
    const cellSize = this.pheromones.cellSize;
    const startCol = Math.max(0, Math.floor(this.camera.x / cellSize));
    const endCol = Math.min(this.pheromones.cols, Math.ceil((this.camera.x + this.canvas.width) / cellSize));
    const startRow = Math.max(0, Math.floor(this.camera.y / cellSize));
    const endRow = Math.min(this.pheromones.rows, Math.ceil((this.camera.y + this.canvas.height) / cellSize));

    for (let row = startRow; row < endRow; row += 1) {
      for (let col = startCol; col < endCol; col += 1) {
        const value = this.pheromones.grid[row][col];
        if (value < 0.25) {
          continue;
        }
        const alpha = Math.min(0.2, value * 0.026);
        ctx.fillStyle = `rgba(116, 223, 197, ${alpha})`;
        ctx.beginPath();
        ctx.arc(
          col * cellSize - this.camera.x + cellSize * 0.5,
          row * cellSize - this.camera.y + cellSize * 0.5,
          4 + value * 2.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  }

  drawNest() {
    const ctx = this.ctx;
    const sx = this.nest.x - this.camera.x;
    const sy = this.nest.y - this.camera.y;
    const ringPulse = Math.sin(this.time * 2.6) * 2;
    const healthRatio = clamp(this.nest.health / this.nest.maxHealth, 0, 1);

    ctx.save();
    ctx.fillStyle = this.nest.flash > 0 ? "#ffb6a6" : "#7a4a25";
    ctx.beginPath();
    ctx.arc(sx, sy, this.nest.radius + 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2a160d";
    ctx.beginPath();
    ctx.arc(sx, sy, this.nest.radius - 8, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(sx, sy, 6, sx, sy, this.nest.radius + 34);
    gradient.addColorStop(0, "rgba(255, 190, 100, 0.18)");
    gradient.addColorStop(1, "rgba(255, 190, 100, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sx, sy, this.nest.radius + 34 + ringPulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this.selectedNest ? "rgba(255, 219, 121, 0.92)" : "rgba(255, 219, 121, 0.55)";
    ctx.lineWidth = this.selectedNest ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, this.nest.radius + 22 + ringPulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.fillRect(sx - 52, sy + 68, 104, 10);
    ctx.fillStyle = healthRatio > 0.45 ? "#88df88" : "#ff6c63";
    ctx.fillRect(sx - 52, sy + 68, 104 * healthRatio, 10);
    ctx.restore();
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const effect of this.effects) {
      const t = effect.life / effect.maxLife;
      const sx = effect.x - this.camera.x;
      const sy = effect.y - this.camera.y;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = effect.kind === "slash" ? 2.6 : 2;
      ctx.beginPath();
      if (effect.kind === "slash") {
        ctx.arc(sx, sy, 8 + (1 - t) * 10, -0.8, 0.8);
      } else {
        ctx.arc(sx, sy, 6 + (1 - t) * 14, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMinimap() {
    const ctx = this.ctx;
    const mapWidth = 190;
    const mapHeight = 126;
    const x = this.canvas.width - mapWidth - 18;
    const y = this.canvas.height - mapHeight - 18;
    const scaleX = mapWidth / this.world.width;
    const scaleY = mapHeight / this.world.height;

    ctx.save();
    ctx.fillStyle = "rgba(15, 11, 8, 0.72)";
    ctx.fillRect(x, y, mapWidth, mapHeight);
    ctx.strokeStyle = "rgba(255, 219, 141, 0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, mapWidth, mapHeight);

    for (const obstacle of this.obstacles) {
      ctx.fillStyle = "#78614b";
      ctx.beginPath();
      ctx.arc(x + obstacle.x * scaleX, y + obstacle.y * scaleY, Math.max(1.5, obstacle.radius * scaleX), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const food of this.foodSources) {
      ctx.fillStyle = "rgba(139, 235, 118, 0.9)";
      ctx.fillRect(x + food.x * scaleX - 1, y + food.y * scaleY - 1, 3, 3);
    }
    for (const ant of this.ants) {
      ctx.fillStyle = ant.type === "worker" ? "#e0c27c" : "#ffb46e";
      ctx.fillRect(x + ant.x * scaleX, y + ant.y * scaleY, 2, 2);
    }
    for (const enemy of this.enemies) {
      ctx.fillStyle = "#ff6d61";
      ctx.fillRect(x + enemy.x * scaleX - 1, y + enemy.y * scaleY - 1, 3, 3);
    }
    ctx.fillStyle = "#f5e3b5";
    ctx.beginPath();
    ctx.arc(x + this.nest.x * scaleX, y + this.nest.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(122, 220, 255, 0.9)";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + this.camera.x * scaleX, y + this.camera.y * scaleY, this.canvas.width * scaleX, this.canvas.height * scaleY);
    ctx.fillStyle = "rgba(255, 241, 212, 0.86)";
    ctx.font = "12px Trebuchet MS";
    ctx.fillText("Minimap", x + 10, y + 15);
    ctx.restore();
  }

  drawCanvasHud() {
    const ctx = this.ctx;
    const label = this.activeWave
      ? `Wave ${this.wave} active`
      : `Next wave in ${Math.max(0, Math.ceil(this.waveCooldown))}s`;
    ctx.save();
    ctx.fillStyle = "rgba(10, 8, 6, 0.52)";
    ctx.fillRect(18, this.canvas.height - 62, 270, 42);
    ctx.strokeStyle = "rgba(255, 215, 138, 0.14)";
    ctx.strokeRect(18, this.canvas.height - 62, 270, 42);
    ctx.fillStyle = "#ffe8b8";
    ctx.font = "16px Trebuchet MS";
    ctx.fillText(label, 30, this.canvas.height - 36);
    ctx.fillStyle = this.isNight ? "#9cc6ff" : "#ffd484";
    ctx.fillText(this.isNight ? "Night" : "Day", 220, this.canvas.height - 36);
    ctx.restore();
  }

  drawWorldLabels() {
    const ctx = this.ctx;
    const sx = this.nest.x - this.camera.x;
    const sy = this.nest.y - this.camera.y;
    ctx.save();
    ctx.fillStyle = "rgba(255, 240, 211, 0.92)";
    ctx.font = "16px Trebuchet MS";
    ctx.fillText("Queen's Nest", sx - 44, sy - 84);
    ctx.restore();
  }

  draw() {
    this.drawBackground();
    this.drawWorldBounds();
    this.drawPheromones();
    for (const obstacle of this.obstacles) {
      obstacle.draw(this.ctx, this.camera);
    }
    for (const food of this.foodSources) {
      food.draw(this.ctx, this.camera, this.time);
    }
    this.drawNest();
    this.queen.draw(this.ctx, this.camera, this.time);
    for (const ant of this.ants) {
      ant.draw(this.ctx, this.camera, this.time);
    }
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx, this.camera, this.time);
    }
    this.drawEffects();
    this.drawWorldLabels();
    this.drawCanvasHud();
    this.drawMinimap();
  }

  loop(timestamp) {
    const dt = Math.min(0.033, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    this.update(dt);
    this.draw();
    requestAnimationFrame((time) => this.loop(time));
  }
}

window.addEventListener("load", () => {
  new Game();
});
