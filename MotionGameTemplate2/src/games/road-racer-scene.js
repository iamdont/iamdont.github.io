// src/games/road-racer-scene.js
import { BaseScene } from '../core/base-scene.js';

class ObjectManager {
    constructor(scene) {
        this.scene = scene;
        this.objects = [];
        this.spawnCounter = 0;
    }
    reset() {
        this.objects = [];
        this.spawnCounter = 0;
    }
    update(currentSpeed, spawnDistance) {
        const { canvas, gameProgress } = this.scene;
        if (!canvas) return;
        this.spawnCounter += currentSpeed;
        if (this.spawnCounter > spawnDistance && gameProgress < 0.95) {
            this.spawnCounter = 0;
            this.spawnObject();
        }
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const obj = this.objects[i];
            obj.y += currentSpeed;
            if (obj.y > canvas.height + 50 && obj.type !== 'finish-line') {
                this.objects.splice(i, 1);
            }
        }
    }
    spawnObject() {
        const { world, canvas } = this.scene;
        const roadStartX = (canvas.width - world.roadWidth) / 2;
        const lane = Math.floor(Math.random() * 3);
        const rand = Math.random();
        const type = rand < 0.5 ? 'collectible' : rand < 0.85 ? 'obstacle' : 'boost';
        const lastObj = this.objects[this.objects.length - 1];
        if (lastObj && lastObj.lane === lane && lastObj.y < 50) return;
        const newObject = {
            type,
            lane,
            x: roadStartX + (lane + 0.5) * world.laneWidth,
            y: -50,
            width: 50,
            height: 50
        };
        if (type === 'obstacle') {
            newObject.width = world.laneWidth * 0.8;
            newObject.height = 30;
        }
        this.objects.push(newObject);
    }
    spawnFinishLine() {
        const { world, canvas } = this.scene;
        this.objects.push({
            type: 'finish-line',
            x: canvas.width / 2,
            y: -100,
            width: world.roadWidth,
            height: 40
        });
    }
    draw(ctx) {
        this.objects.forEach(obj => {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (obj.type === 'collectible') {
                ctx.fillStyle = '#FFD700';
                ctx.font = `${obj.width}px Arial`;
                ctx.fillText('★', obj.x, obj.y);
            } else if (obj.type === 'obstacle') {
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
            } else if (obj.type === 'boost') {
                ctx.fillStyle = '#00C4FF';
                ctx.font = `${obj.width}px Arial`;
                ctx.fillText('⚡', obj.x, obj.y);
            } else if (obj.type === 'finish-line') {
                const s = 20;
                for (let i = 0; i < obj.width / s; i++) {
                    ctx.fillStyle = (i % 2 === 0) ? '#000' : '#FFF';
                    ctx.fillRect(obj.x - obj.width / 2 + i * s, obj.y - obj.height / 2, s, obj.height);
                }
            }
        });
    }
}


export class RoadRacerScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.ui = {};
        
        this.lastTimestamp = 0;
        this.score = 0;
        this.gameProgress = 0;
        this.gameState = 'PLAYING';

        this.config = {
            gameTotalDistance: 30000, baseSpeed: 5, boostMultiplier: 1.8,
            boostDuration: 3000, invincibleDuration: 2000, hitSlowdownFactor: 0.3,
            playerHitboxScale: 0.8, spawnDistance: 800
        };

        this.objectManager = new ObjectManager(this);

        this.world = { roadWidth: 0, laneWidth: 0, roadScrollY: 0 };

        this.player = {
            targetLane: 1, x: 0, y: 0, width: 60, height: 100,
            isInvincible: false, invincibleTimer: 0, isSlowed: false,
            slowdownTimer: 0, isBoosted: false, boostTimer: 0
        };
        
        this.handState = { x: 0, isVisible: false };
        
        this._onWindowResize = this._onWindowResize.bind(this);
    }

    renderHTML() {
        // 還原到最原始嘅 HTML 結構
        return `
            <style>
                .rr-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #4a7852; }
                #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
                #ui-container { position: absolute; top: 20px; left: 20px; right: 20px; z-index: 10; display: flex; justify-content: space-between; align-items: flex-start; color: white; font-family: monospace; font-size: 2em; text-shadow: 2px 2px 4px black; pointer-events: none; }
                #score-area { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; }
                #progress-bar-container { position: relative; width: 20px; height: 80vh; background: rgba(0,0,0,0.3); border-radius: 10px; border: 2px solid white; }
                #progress-bar-fill { position: absolute; bottom: 0; width: 100%; background-color: #ffd700; border-radius: 8px; }
                #win-message { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 5em; color: #ffd700; display: none; z-index: 20; text-shadow: 0 0 15px black; }
                #debug-hud { position: absolute; bottom: 20px; left: 20px; z-index: 20; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 8px; color: white; font-family: monospace; width: 250px; pointer-events: auto; }
                .slider-group { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 10px; font-size: 14px; }
                .slider-group .label-container { display: flex; justify-content: space-between; width: 100%; }
                .slider-group label { margin-bottom: 5px; }
                .slider-group input { width: 100%; }
                #debug-apply-reset { width: 100%; padding: 10px; margin-top: 10px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: none; }
            </style>
            <div class="rr-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <div id="ui-container">
                    <div id="score-area">★ 0</div>
                    <div id="progress-bar-container"><div id="progress-bar-fill" style="height: 0%;"></div></div>
                </div>
                <div id="win-message">YOU WIN!</div>
                <canvas id="game-canvas"></canvas>
                <div id="debug-hud">
                    <div class="slider-group"><div class="label-container"><label for="baseSpeed">Base Speed:</label><span id="baseSpeed-value">5.0</span></div><input type="range" id="baseSpeed" min="1" max="20" step="0.5" value="5"></div>
                    <div class="slider-group"><div class="label-container"><label for="boostMultiplier">Boost Multiplier:</label><span id="boostMultiplier-value">1.8</span></div><input type="range" id="boostMultiplier" min="1.1" max="3" step="0.1" value="1.8"></div>
                    <div class="slider-group"><div class="label-container"><label for="hitSlowdownFactor">Hit Slowdown:</label><span id="hitSlowdownFactor-value">0.3</span></div><input type="range" id="hitSlowdownFactor" min="0.1" max="0.9" step="0.1" value="0.3"></div>
                    <div class="slider-group"><div class="label-container"><label for="invincibleDuration">Invincible (ms):</label><span id="invincibleDuration-value">2000</span></div><input type="range" id="invincibleDuration" min="500" max="5000" step="100" value="2000"></div>
                    <div class="slider-group"><div class="label-container"><label for="playerHitboxScale">Hitbox Scale:</label><span id="playerHitboxScale-value">0.80</span></div><input type="range" id="playerHitboxScale" min="0.5" max="1.2" step="0.05" value="0.8"></div>
                    <button id="debug-apply-reset" data-motion-activatable>Apply & Reset</button>
                </div>
            </div>
        `;
    }

    onInit() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.ui = {
            score: document.getElementById('score-area'),
            progressBar: document.getElementById('progress-bar-fill'),
            winMessage: document.getElementById('win-message')
        };
        
        this.motionEngine.setMode('hands');
        this.motionEngine.showPointer(true);
        this.motionEngine.outputCanvas.style.opacity = '0.2';
        
        this._bindEvents();
        this.resetGame();
    }

    onDestroy() {
        if(this.objectManager) { this.objectManager.reset(); this.objectManager = null; }
        this.canvas = null; this.ctx = null; this.ui = {};
        this.motionEngine.outputCanvas.style.opacity = '1';
        console.log("[RoadRacerScene] Destroyed.");
    }
    
    _bindEvents() {
        this.addManagedEventListener(document.getElementById('debug-apply-reset'), 'click', () => this.resetGame());
        
        const debugSliders = this.container.querySelectorAll('#debug-hud input[type="range"]');
        debugSliders.forEach(slider => {
            const configKey = slider.id;
            const valueSpan = this.container.querySelector(`#${configKey}-value`);
            if (this.config[configKey] !== undefined && valueSpan) {
                slider.value = this.config[configKey];
                valueSpan.textContent = parseFloat(slider.value).toFixed(configKey === 'playerHitboxScale' ? 2 : 1);
                this.addManagedEventListener(slider, 'input', (e) => {
                    const val = parseFloat(e.target.value);
                    this.config[configKey] = val;
                    valueSpan.textContent = val.toFixed(configKey === 'playerHitboxScale' ? 2 : 1);
                });
            }
        });
        this.listenToMotionResults();
        this.addManagedEventListener(window, 'resize', this._onWindowResize);
    }
    
    resetGame() {
        this.score = 0; this.gameProgress = 0; this.gameState = 'PLAYING';
        if (this.ui.winMessage) this.ui.winMessage.style.display = 'none';
        Object.assign(this.player, {
            targetLane: 1, isInvincible: false, invincibleTimer: 0,
            isSlowed: false, slowdownTimer: 0, isBoosted: false, boostTimer: 0
        });
        this._onWindowResize();
        if (this.canvas) { this.player.x = this.canvas.width / 2; }
        if (this.objectManager) this.objectManager.reset();
        this.lastTimestamp = 0;
    }
    
    onResults(results) {
        // [CRITICAL FIX] 修正控制邏輯
        // 直接使用 motionEngine 經過平滑同鏡像處理後嘅主指針 (this.motionEngine.pointer)
        const pointer = this.motionEngine.pointer;
        this.handState.isVisible = pointer.isVisible;

        if (this.handState.isVisible) {
            // pointer.x 已經係 0-window.innerWidth 之間嘅屏幕坐標，我哋只需要將佢轉換成 0-1 嘅比例
            this.handState.x = pointer.x / window.innerWidth;
        }
    }
    
    onUpdate(timestamp) {
        if (!this.lastTimestamp) { this.lastTimestamp = timestamp; return; }
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        if (this.handState.isVisible) {
            if (this.handState.x < 1 / 3) this.player.targetLane = 0;
            else if (this.handState.x < 2 / 3) this.player.targetLane = 1;
            else this.player.targetLane = 2;
        }

        const roadStartX = (this.canvas.width - this.world.roadWidth) / 2;
        const targetX = roadStartX + (this.player.targetLane + 0.5) * this.world.laneWidth;
        this.player.x += (targetX - this.player.x) * 0.2;

        if (this.gameState === 'FINISHED') return;
        
        ['invincibleTimer', 'slowdownTimer', 'boostTimer'].forEach(timerKey => {
            if (this.player[timerKey] > 0) {
                this.player[timerKey] -= deltaTime;
                if (this.player[timerKey] <= 0) {
                    this.player[timerKey] = 0;
                    if (timerKey === 'slowdownTimer') this.player.isSlowed = false;
                    else if (timerKey === 'boostTimer') this.player.isBoosted = false;
                    else if (timerKey === 'invincibleTimer') this.player.isInvincible = false;
                }
            }
        });

        let currentSpeed = this.config.baseSpeed;
        if (this.player.isBoosted) currentSpeed *= this.config.boostMultiplier;
        if (this.player.isSlowed) currentSpeed *= this.config.hitSlowdownFactor;

        const lastProgress = this.gameProgress;
        this.gameProgress = Math.min(1, this.gameProgress + currentSpeed / this.config.gameTotalDistance);
        if (this.gameProgress >= 1 && lastProgress < 1) { this.objectManager.spawnFinishLine(); }

        this.world.roadScrollY = (this.world.roadScrollY + currentSpeed) % 45;
        this.objectManager.update(currentSpeed, this.config.spawnDistance);
        
        this._checkCollisions();
        
        this.ui.score.textContent = `★ ${this.score}`;
        this.ui.progressBar.style.height = `${this.gameProgress * 100}%`;
    }

    onDraw() {
        if (!this.ctx) return;
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        const roadX = (w - this.world.roadWidth) / 2;
        ctx.fillStyle = '#444';
        ctx.fillRect(roadX, 0, this.world.roadWidth, h);
        ctx.strokeStyle = 'rgba(255, 255, 255, .6)';
        ctx.lineWidth = 5;
        ctx.setLineDash([25, 20]);
        for (let i = 1; i <= 2; i++) {
            const lineX = roadX + i * this.world.laneWidth;
            ctx.lineDashOffset = -this.world.roadScrollY;
            ctx.beginPath();
            ctx.moveTo(lineX, 0);
            ctx.lineTo(lineX, h);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        this.objectManager.draw(ctx);
        this._drawPlayer();
    }
    
    _checkCollisions() {
        const p = this.player;
        const playerRect = {
            l: p.x - p.width * this.config.playerHitboxScale / 2, r: p.x + p.width * this.config.playerHitboxScale / 2,
            t: p.y - p.height * this.config.playerHitboxScale / 2, b: p.y + p.height * this.config.playerHitboxScale / 2,
        };
        for (let i = this.objectManager.objects.length - 1; i >= 0; i--) {
            const obj = this.objectManager.objects[i];
            const objRect = { l: obj.x - obj.width / 2, r: obj.x + obj.width / 2, t: obj.y - obj.height / 2, b: obj.y + obj.height / 2 };
            if (playerRect.l < objRect.r && playerRect.r > objRect.l && playerRect.t < objRect.b && playerRect.b > objRect.t) {
                if (obj.type === 'finish-line') {
                    if (this.gameState === 'PLAYING') {
                        this.gameState = 'FINISHED'; this.ui.winMessage.style.display = 'block';
                    }
                } else if (obj.type === 'collectible') {
                    this.score += 10; this.objectManager.objects.splice(i, 1);
                } else if (obj.type === 'boost') {
                    this.player.isBoosted = true; this.player.boostTimer = this.config.boostDuration; this.objectManager.objects.splice(i, 1);
                } else if (obj.type === 'obstacle' && !this.player.isInvincible) {
                    this.player.isSlowed = true; this.player.slowdownTimer = this.config.invincibleDuration;
                    this.player.isInvincible = true; this.player.invincibleTimer = this.config.invincibleDuration;
                }
            }
        }
    }

    _drawPlayer() {
        if (!this.ctx) return;
        const p = this.player;
        const ctx = this.ctx;
        ctx.save();
        if (p.isInvincible) {
            ctx.globalAlpha = (Math.sin(Date.now() / 100) + 1) / 2 * 0.8 + 0.2;
        }
        ctx.fillStyle = p.isBoosted ? '#00C4FF' : '#ff4136';
        ctx.beginPath();
        const carTopWidth = p.width * 0.8;
        const carTopOffset = (p.width - carTopWidth) / 2;
        ctx.moveTo(p.x - p.width / 2 + carTopOffset, p.y - p.height / 2);
        ctx.lineTo(p.x + p.width / 2 - carTopOffset, p.y - p.height / 2);
        ctx.lineTo(p.x + p.width / 2, p.y + p.height / 2);
        ctx.lineTo(p.x - p.width / 2, p.y + p.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'yellow';
        ctx.fillRect(p.x - p.width / 2 + carTopOffset + 5, p.y - p.height / 2 - 2, 10, 5);
        ctx.fillRect(p.x + p.width / 2 - carTopOffset - 15, p.y - p.height / 2 - 2, 10, 5);
        ctx.restore();
    }

    _onWindowResize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.world.roadWidth = this.canvas.width * 0.6;
        this.world.laneWidth = this.world.roadWidth / 3;
        this.player.y = this.canvas.height - (this.player.height / 2) - 40;
    }
}