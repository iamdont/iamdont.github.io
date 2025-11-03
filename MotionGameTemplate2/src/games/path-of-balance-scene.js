// src/scenes/path-of-balance-scene.js

export class PathOfBalanceScene {
    constructor() {
        this.loopHandle = null;
        this.resultsListener = null;
        this.latestPoseLandmarks = null;
        this.canvas = null; this.ctx = null; this.ui = {};
        
        // Game state
        this.gameState = 'idle';
        this.player = { x: 0, balanceForce: 0, progress: 0, width: 60 };
        this.balanceAngle = 0;
        this.isStepping = false;
        this.pathTotalLength = 2000;
        this.pathOffset = 0;
    }

    render() {
        return `
            <style>
                .pob-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #34495e; font-family: 'Segoe UI', sans-serif; }
                .pob-scene #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .pob-scene #game-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: white; text-shadow: 2px 2px 4px black; }
                .pob-scene #message { font-size: 4em; font-weight: bold; }
                .pob-scene #restart-button { padding: 15px 30px; font-size: 1.5em; background-color: #ffd700; color: #1a1a1a; border: none; border-radius: 10px; cursor: pointer; margin-top: 20px; pointer-events: auto; display: none; }
                .pob-scene #progress-bar-container { position: absolute; top: 80px; width: 50%; height: 20px; background-color: rgba(0,0,0,0.5); border-radius: 10px; }
                .pob-scene #progress-bar { width: 0%; height: 100%; background-color: #2ecc71; border-radius: 10px; }
            </style>
            <div class="pob-scene">
                <a class="back-button" data-scene-changer="launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="game-canvas"></canvas>
                <div id="game-ui">
                    <div id="progress-bar-container"><div id="progress-bar"></div></div>
                    <h2 id="message"></h2>
                    <button id="restart-button" data-motion-activatable>Restart</button>
                </div>
            </div>
        `;
    }

    init() {
        window.motionEngine.setMode('pose');
        window.motionEngine.setPointerHand('left');
        window.motionEngine.outputCanvas.style.display = 'block';

        this.canvas = document.getElementById('game-canvas'); this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
        this.ui.messageEl = document.getElementById('message');
        this.ui.restartBtn = document.getElementById('restart-button');
        this.ui.progressBar = document.getElementById('progress-bar');
        
        this._bindEvents();
        this.startGame();
    }

    destroy() {
        console.log("Destroying PathOfBalanceScene...");
        if (this.loopHandle) cancelAnimationFrame(this.loopHandle);
        window.motionEngine.setPointerHand('right');
        window.motionEngine.setMode('hands');
        const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } };
        removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener);
    }

    _bindEvents() {
        document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger));
        this.ui.restartBtn.addEventListener('click', () => this.startGame());
        this.resultsListener = (results) => { this.latestPoseLandmarks = results.poseLandmarks; };
        window.motionEngine.on('results-updated', this.resultsListener);
    }

    startGame() {
        this.player = { x: this.canvas.width / 2, balanceForce: 0, progress: 0, width: 60 };
        this.balanceAngle = 0; this.isStepping = false;
        this.pathOffset = 0;
        this.gameState = 'playing';
        this.ui.messageEl.textContent = '';
        this.ui.restartBtn.style.display = 'none';
        if (!this.loopHandle) this.gameLoop();
    }

    update() {
        if (this.gameState !== 'playing') return;
        
        // --- 核心遊戲邏輯 ---
        if (this.latestPoseLandmarks) {
            const landmarks = this.latestPoseLandmarks;
            // Balance
            const [ls, rs, lh, rh] = [11, 12, 23, 24].map(i => landmarks[i]);
            if (ls && rs && lh && rh && ls.visibility > 0.5 && rs.visibility > 0.5) {
                const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
                const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
                const angleRad = Math.atan2(shoulderMid.y - hipMid.y, shoulderMid.x - hipMid.x);
                this.balanceAngle = (angleRad * 180 / Math.PI) + 90;
                this.player.balanceForce = this.balanceAngle * -0.25;
            }
            // Stepping
            const [lk, rk] = [25, 26].map(i => landmarks[i]);
            if (lk && rk && lh && rh && lk.visibility > 0.5 && rk.visibility > 0.5) {
                const hipHeight = (lh.y + rh.y) / 2;
                const leftKneeStepped = lk.y < hipHeight - 0.05;
                const rightKneeStepped = rk.y < hipHeight - 0.05;
                if ((leftKneeStepped || rightKneeStepped) && !this.isStepping) {
                    this.isStepping = true;
                    this.pathOffset += 25;
                    this.player.progress = (this.pathOffset / this.pathTotalLength) * 100;
                } else if (!leftKneeStepped && !rightKneeStepped) {
                    this.isStepping = false;
                }
            }
        }
        // --- 邏輯結束 ---
        
        this.player.x += this.player.balanceForce;
        const w = this.canvas.width, h = this.canvas.height;
        const playerVisualY = h * 0.9, horizonY = h * 0.6;
        const pathWidthStart = w * 1.5, pathWidthEnd = w * 0.05;
        const playerDepthRatio = (playerVisualY - horizonY) / (h - horizonY);
        const pathWidthAtPlayer = pathWidthEnd + (pathWidthStart - pathWidthEnd) * playerDepthRatio;
        const pathLeftEdge = w/2 - pathWidthAtPlayer/2, pathRightEdge = w/2 + pathWidthAtPlayer/2;
        const playerLeftEdge = this.player.x - this.player.width / 2, playerRightEdge = this.player.x + this.player.width / 2;
        
        if (playerLeftEdge < pathLeftEdge || playerRightEdge > pathRightEdge) {
            this.gameState = 'gameover';
            this.ui.messageEl.textContent = 'You Fell!';
            this.ui.restartBtn.style.display = 'block';
        }
        if (this.player.progress >= 100) {
            this.gameState = 'win';
            this.ui.messageEl.textContent = 'You Reached the End!';
            this.ui.restartBtn.style.display = 'block';
        }
    }
    
    draw() {
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = '#2c3e50'; this.ctx.fillRect(0, 0, w, h);
        
        // 畫路
        const horizonY = h * 0.6, pathWidthStart = w * 1.5, pathWidthEnd = w * 0.05;
        this.ctx.beginPath(); this.ctx.moveTo(w/2-pathWidthEnd/2, horizonY); this.ctx.lineTo(w/2+pathWidthEnd/2, horizonY); this.ctx.lineTo(w/2+pathWidthStart/2, h); this.ctx.lineTo(w/2-pathWidthStart/2, h); this.ctx.closePath(); this.ctx.fillStyle = '#95a5a6'; this.ctx.fill();
        this.ctx.strokeStyle = '#7f8c8d'; this.ctx.lineWidth = 5;
        const lineSpacing = 50, numLines = 20;
        for(let i = 0; i < numLines; i++) {
            const lineWorldY = (i * lineSpacing + this.pathOffset) % (numLines * lineSpacing);
            const lineScreenRatio = lineWorldY / (numLines * lineSpacing);
            const y = horizonY + (h - horizonY) * lineScreenRatio;
            const width = pathWidthEnd + (pathWidthStart - pathWidthEnd) * lineScreenRatio;
            this.ctx.beginPath(); this.ctx.moveTo(w/2 - width/2, y); this.ctx.lineTo(w/2 + width/2, y); this.ctx.stroke();
        }
        
        // 畫玩家（火柴人）
        const playerBaseY = h * 0.9;
        this.ctx.save(); this.ctx.translate(this.player.x, playerBaseY); this.ctx.rotate(this.player.balanceForce * 0.05);
        this.ctx.strokeStyle = '#ffd700'; this.ctx.lineWidth = 8; this.ctx.lineCap = 'round';
        this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(0, -50); this.ctx.stroke(); // body
        this.ctx.beginPath(); this.ctx.arc(0, -65, 15, 0, Math.PI * 2); this.ctx.stroke(); // head
        this.ctx.beginPath(); this.ctx.moveTo(0, -40); this.ctx.lineTo(-30, -20); this.ctx.stroke(); // left arm
        this.ctx.beginPath(); this.ctx.moveTo(0, -40); this.ctx.lineTo(30, -20); this.ctx.stroke(); // right arm
        const stepOffset = this.isStepping ? 20 : 0;
        this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(-20, 30 + stepOffset); this.ctx.stroke(); // left leg
        this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(20, 30 - stepOffset); this.ctx.stroke(); // right leg
        this.ctx.restore();
        
        this.ui.progressBar.style.width = `${this.player.progress}%`;
    }
    
    gameLoop() {
        this.update();
        this.draw();
        this.loopHandle = requestAnimationFrame(() => this.gameLoop());
    }
}