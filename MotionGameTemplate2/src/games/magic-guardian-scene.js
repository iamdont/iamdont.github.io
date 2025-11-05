// src/games/magic-guardian-scene.js (更新後)
// [FIX #1-New] 修正手部灰色圓圈問題，令視覺反饋更清晰

import { BaseScene } from '../core/base-scene.js';

class GestureRecognizer {
    static getGesture(landmarks) {
        if (!landmarks) return 'none';
        try {
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            
            const isFist = this.distance(indexTip, wrist) < this.distance(landmarks[5], wrist) &&
                           this.distance(middleTip, wrist) < this.distance(landmarks[9], wrist) &&
                           this.distance(ringTip, wrist) < this.distance(landmarks[13], wrist) &&
                           this.distance(pinkyTip, wrist) < this.distance(landmarks[17], wrist);

            if (isFist) return 'fist';

            const isFive = this.distance(thumbTip, pinkyTip) > 0.15 &&
                           this.distance(indexTip, wrist) > this.distance(landmarks[5], wrist);

            if (isFive) return 'open';

            return 'none';
        } catch (e) {
            return 'none';
        }
    }
    static distance(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
}

export class MagicGuardianScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.ui = {};

        this.player = {
            bodyHitbox: { x: 0, y: 0, rx: 0, ry: 0 },
            // 添加 isVisible 屬性，用嚟追蹤手部數據是否存在
            leftHand: { x: -100, y: -100, radius: 65, gesture: 'none', isVisible: false },
            rightHand: { x: -100, y: -100, radius: 65, gesture: 'none', isVisible: false }
        };

        this.score = 0;
        this.lives = 5;
        this.isGameOver = false;

        this.fireballs = [];
        this.magicOrbs = [];
        this.particles = [];
        this.spawnInterval = null;
        this.flashTimeout = null;
    }

    renderHTML() {
        return `
            <style>
                .mg-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #112; }
                .mg-scene #output-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
                .mg-scene #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; color: white; text-shadow: 2px 2px 4px black; pointer-events: none; }
                .mg-scene #game-stats { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 40px; font-size: 2em; font-weight: bold; }
                .mg-scene #game-over-screen { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10; display: none; flex-direction: column; justify-content: center; align-items: center; pointer-events: auto; }
                .mg-scene #game-over-screen h2 { font-size: 5em; margin: 0; color: #ff4d4d; }
                .mg-scene #game-over-screen p { font-size: 1.5em; }
                .mg-scene #restart-button { padding: 15px 30px; font-size: 1.5em; background-color: #ffd700; color: #1a1a1a; border: none; border-radius: 10px; cursor: pointer; margin-top: 20px; }
                .mg-scene .screen-flash { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5; pointer-events: none; opacity: 0; }
                .mg-scene .hit-flash { background-color: red; animation: flash 0.3s ease-out; }
                @keyframes flash { from { opacity: 0.7; } to { opacity: 0; } }
            </style>
            <div class="mg-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="output-canvas"></canvas>
                <div id="ui-layer">
                    <div id="game-stats">
                        <div id="score">Score: 0</div>
                        <div id="lives">Lives: ❤️❤️❤️❤️❤️</div>
                    </div>
                </div>
                <div id="game-over-screen">
                    <h2>GAME OVER</h2>
                    <p id="final-score"></p>
                    <button id="restart-button" data-motion-activatable>Restart Game</button>
                </div>
                <div id="screen-flash" class="screen-flash"></div>
            </div>
        `;
    }

    onInit() {
        this.motionEngine.setMode('holistic');
        this.motionEngine.showPointer(true);

        this.canvas = document.getElementById('output-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.ui = {
            scoreEl: document.getElementById('score'),
            livesEl: document.getElementById('lives'),
            gameOverScreen: document.getElementById('game-over-screen'),
            finalScoreEl: document.getElementById('final-score'),
            restartBtn: document.getElementById('restart-button'),
            screenFlashEl: document.getElementById('screen-flash')
        };
        
        this.addManagedEventListener(this.ui.restartBtn, 'click', () => this.startGame());
        this.listenToMotionResults();
        
        this.startGame();
    }

    onDestroy() {
        if (this.spawnInterval) clearInterval(this.spawnInterval);
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        this.spawnInterval = null;
        this.flashTimeout = null;

        this.fireballs = [];
        this.magicOrbs = [];
        this.particles = [];
        
        this.canvas = null;
        this.ctx = null;
        this.ui = {};
        console.log("[MagicGuardianScene] Timers and game objects cleared.");
    }

    onUpdate() {
        this.updatePlayerState();
        
        if (this.isGameOver) {
            this.updateGameObjects(true);
            return;
        }

        this.updateGameObjects(false);
        this.checkCollisions();
    }

    onDraw() {
        if (!this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        
        this.ctx.save();
        if (this.latestResults && this.latestResults.image) {
            this.ctx.translate(w, 0);
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.latestResults.image, 0, 0, w, h);
        } else {
            this.ctx.fillStyle = '#112';
            this.ctx.fillRect(0, 0, w, h);
        }
        this.ctx.restore();

        this.drawGameElements();
    }

    startGame() {
        this.score = 0;
        this.lives = 5;
        this.isGameOver = false;
        this.fireballs = [];
        this.magicOrbs = [];
        this.particles = [];
        
        this.updateUI();
        this.ui.gameOverScreen.style.display = 'none';

        if (this.spawnInterval) clearInterval(this.spawnInterval);
        this.spawnInterval = setInterval(() => {
            if (this.isGameOver) return;
            this.spawnFireball();
            if (Math.random() < 0.4) this.spawnMagicOrb();
        }, 1200);
    }

    updatePlayerState() {
        if (!this.latestResults) {
            this.player.leftHand.isVisible = false;
            this.player.rightHand.isVisible = false;
            return;
        }
        
        const w = this.canvas.width, h = this.canvas.height;
        const getScreenCoords = (p) => (p ? { x: (1 - p.x) * w, y: p.y * h } : null);

        if (this.latestResults.poseLandmarks) {
            const [ls, rs, lh, rh] = [11, 12, 23, 24].map(i => this.latestResults.poseLandmarks[i]);
            if (ls && rs && lh && rh && ls.visibility > 0.6 && rh.visibility > 0.6) {
                const lsp = getScreenCoords(ls), rsp = getScreenCoords(rs);
                const lhp = getScreenCoords(lh), rhp = getScreenCoords(rh);
                this.player.bodyHitbox.x = (lsp.x + rsp.x) / 2;
                this.player.bodyHitbox.y = (lsp.y + lhp.y) / 2;
                this.player.bodyHitbox.rx = Math.abs(lsp.x - rsp.x) / 2 * 0.8;
                this.player.bodyHitbox.ry = Math.abs(lsp.y - lhp.y) / 2 * 0.9;
            }
        }

        const updateHand = (handName, landmarks) => {
            const hand = this.player[handName];
            hand.isVisible = !!landmarks; // 直接用 landmarks 存唔存在嚟判斷
            if (!hand.isVisible) return;
            
            hand.gesture = GestureRecognizer.getGesture(landmarks);
            const [wrist, indexMCP, pinkyMCP] = [0, 5, 17].map(i => landmarks[i]);
            if (wrist && indexMCP && pinkyMCP) {
                const palmCenterX = (wrist.x + indexMCP.x + pinkyMCP.x) / 3;
                const palmCenterY = (wrist.y + indexMCP.y + pinkyMCP.y) / 3;
                const screenPos = getScreenCoords({ x: palmCenterX, y: palmCenterY });
                if (screenPos) {
                    hand.x = screenPos.x;
                    hand.y = screenPos.y;
                }
            }
        };
        updateHand('leftHand', this.latestResults.leftHandLandmarks);
        updateHand('rightHand', this.latestResults.rightHandLandmarks);
    }
    
    updateGameObjects(isGameOver = false) {
        const move = (obj) => { obj.x += obj.vx; obj.y += obj.vy; };
        
        if (isGameOver) {
            this.particles.forEach(p => { move(p); p.life--; p.radius *= 0.98; });
            this.particles = this.particles.filter(p => p.life > 0);
            return;
        }
        
        this.fireballs.forEach(move);
        this.magicOrbs.forEach(move);
        this.particles.forEach(p => { move(p); p.life--; p.radius *= 0.98; });

        const isOnScreen = (o) => o.x > -50 && o.x < this.canvas.width + 50 && o.y > -50 && o.y < this.canvas.height + 50;
        this.fireballs = this.fireballs.filter(isOnScreen);
        this.magicOrbs = this.magicOrbs.filter(isOnScreen);
        this.particles = this.particles.filter(p => p.life > 0);
    }
    
    checkCollisions() {
        const isCircleColliding = (c1, c2) => Math.hypot(c1.x - c2.x, c1.y - c2.y) < c1.radius + c2.radius;
        const isEllipseColliding = (ellipse, circle) => {
            const dx = circle.x - ellipse.x;
            const dy = circle.y - ellipse.y;
            return ((dx / (ellipse.rx + circle.radius)) ** 2) + ((dy / (ellipse.ry + circle.radius)) ** 2) < 1;
        };

        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const fireball = this.fireballs[i];
            const leftDeflected = this.player.leftHand.isVisible && this.player.leftHand.gesture === 'fist' && isCircleColliding(this.player.leftHand, fireball);
            const rightDeflected = this.player.rightHand.isVisible && this.player.rightHand.gesture === 'fist' && isCircleColliding(this.player.rightHand, fireball);

            if (leftDeflected || rightDeflected) {
                this.score += 20;
                this.createExplosion(fireball.x, fireball.y, 'orange');
                this.fireballs.splice(i, 1);
                this.updateUI();
            } else if (isEllipseColliding(this.player.bodyHitbox, fireball)) {
                this.lives--;
                this.createExplosion(fireball.x, fireball.y, 'red');
                this.fireballs.splice(i, 1);
                this.updateUI();
                this.triggerHitFlash();
                if (this.lives <= 0) {
                    this.gameOver();
                    break;
                }
            }
        }

        for (let i = this.magicOrbs.length - 1; i >= 0; i--) {
            const orb = this.magicOrbs[i];
            const leftCaught = this.player.leftHand.isVisible && this.player.leftHand.gesture === 'open' && isCircleColliding(this.player.leftHand, orb);
            const rightCaught = this.player.rightHand.isVisible && this.player.rightHand.gesture === 'open' && isCircleColliding(this.player.rightHand, orb);

            if (leftCaught || rightCaught) {
                this.score += 100;
                this.createExplosion(orb.x, orb.y, 'cyan');
                this.magicOrbs.splice(i, 1);
                this.updateUI();
            }
        }
    }

    drawGameElements() {
        const { bodyHitbox, leftHand, rightHand } = this.player;

        this.ctx.fillStyle = 'rgba(0, 255, 255, .2)';
        this.ctx.strokeStyle = 'rgba(0, 255, 255, .7)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.ellipse(bodyHitbox.x, bodyHitbox.y, bodyHitbox.rx, bodyHitbox.ry, 0, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();

        this.drawHandCircle(this.ctx, leftHand);
        this.drawHandCircle(this.ctx, rightHand);

        if (!this.isGameOver) {
            this.fireballs.forEach(f => { this.ctx.fillStyle = 'orange'; this.ctx.beginPath(); this.ctx.arc(f.x, f.y, f.radius, 0, 2 * Math.PI); this.ctx.fill(); });
            this.magicOrbs.forEach(o => { this.ctx.fillStyle = 'cyan'; this.ctx.beginPath(); this.ctx.arc(o.x, o.y, o.radius, 0, 2 * Math.PI); this.ctx.fill(); });
        }
        
        this.particles.forEach(p => { this.ctx.fillStyle = p.color; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI); this.ctx.fill(); });
    }

    // [FIX #1-New] 更新 drawHandCircle 邏輯
    drawHandCircle(ctx, hand) {
        if (!hand.isVisible) return; // 如果手唔可見，就唔畫任何嘢

        let color, glow = 'transparent', stroke = 'rgba(200, 200, 200, .7)';

        if (hand.gesture === 'open') {
            color = 'rgba(0, 176, 255, .8)'; // 藍色 - 接波
            glow = '#00B0FF';
        } else if (hand.gesture === 'fist') {
            color = 'rgba(255, 100, 0, .8)'; // 橙色 - 擋波
            glow = '#FF8C00';
            stroke = '#FFD700';
        } else {
            // 手勢係 'none' 但手可見，顯示一個半透明嘅「準備狀態」圓圈，冇發光
            color = 'rgba(255, 255, 255, 0.2)';
            stroke = 'rgba(255, 255, 255, 0.4)';
        }

        ctx.shadowColor = glow;
        ctx.shadowBlur = (hand.gesture !== 'none') ? 20 : 0;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, hand.radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // 無論係咩狀態，都加個邊框，增加可見性
        ctx.strokeStyle = stroke;
        ctx.lineWidth = (hand.gesture === 'fist') ? 4 : 2;
        ctx.stroke();

        ctx.shadowBlur = 0; // 重置 shadowBlur
    }

    spawnObject(type) {
        const w = this.canvas.width, h = this.canvas.height;
        const radius = type === 'fireball' ? 25 : 30;
        let x, y;
        const side = Math.floor(Math.random() * 3);
        switch (side) {
            case 0: x = -radius; y = Math.random() * h * 0.9; break;
            case 1: x = w + radius; y = Math.random() * h * 0.9; break;
            case 2: x = Math.random() * w; y = -radius; break;
        }

        const targetX = w / 2 + (Math.random() - 0.5) * 400;
        const targetY = h / 2 + (Math.random() - 0.5) * 300;
        const angle = Math.atan2(targetY - y, targetX - x);
        const speed = type === 'fireball' ? (2 + Math.random() * 2) : (1.5 + Math.random());
        
        return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius, type };
    }

    spawnFireball() { this.fireballs.push(this.spawnObject('fireball')); }
    spawnMagicOrb() { this.magicOrbs.push(this.spawnObject('magicOrb')); }

    createExplosion(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 2 + Math.random() * 3,
                life: 30 + Math.random() * 30,
                color: color
            });
        }
    }

    triggerHitFlash() {
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        this.ui.screenFlashEl.className = 'screen-flash hit-flash';
        this.flashTimeout = setTimeout(() => {
            this.ui.screenFlashEl.className = 'screen-flash';
        }, 300);
    }
    
    gameOver() {
        this.isGameOver = true;
        clearInterval(this.spawnInterval);
        this.spawnInterval = null;
        this.ui.finalScoreEl.textContent = `Your Score: ${this.score}`;
        this.ui.gameOverScreen.style.display = 'flex';
    }

    updateUI() {
        this.ui.scoreEl.textContent = `Score: ${this.score}`;
        this.ui.livesEl.textContent = `Lives: ${'❤️'.repeat(Math.max(0, this.lives))}`;
    }
}