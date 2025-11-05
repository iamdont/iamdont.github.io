// src/games/path-of-balance-scene.js
import { BaseScene } from '../core/base-scene.js';

class SimplePointSmoother {
    constructor(smoothingFactor = 0.7) {
        this.factor = smoothingFactor;
        this.point = null;
    }
    update(rawPoint) {
        if (rawPoint) {
            if (!this.point) {
                this.point = { ...rawPoint };
            } else {
                this.point.x = this.factor * this.point.x + (1 - this.factor) * rawPoint.x;
                this.point.y = this.factor * this.point.y + (1 - this.factor) * rawPoint.y;
                if (rawPoint.visibility !== undefined) {
                    this.point.visibility = this.factor * this.point.visibility + (1 - this.factor) * rawPoint.visibility;
                }
            }
        }
        return this.point;
    }
}

export class PathOfBalanceScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.ui = {};

        this.gameState = 'idle';
        this.player = { x: 0, balanceForce: 0, progress: 0, width: 60 };
        this.balanceAngle = 0;
        this.isStepping = false;
        this.pathTotalLength = 2000;
        this.pathOffset = 0;

        this.smoothers = {
            leftShoulder: new SimplePointSmoother(),
            rightShoulder: new SimplePointSmoother(),
            leftHip: new SimplePointSmoother(),
            rightHip: new SimplePointSmoother(),
            leftKnee: new SimplePointSmoother(),
            rightKnee: new SimplePointSmoother(),
        };
        this.smoothedLandmarks = {};
    }

    renderHTML() {
        return `
            <div class="pob-container" style="width:100%; height:100%; background: linear-gradient(#34495e, #1a2531); font-size:16px;">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="game-canvas"></canvas>
                <div id="ui-layer" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; color:white; text-shadow: 2px 2px 4px black;">
                    <div style="position: absolute; top: 2.5rem; left: 50%; transform: translateX(-50%); width: 50%; height: 1.25rem; background-color: rgba(0,0,0,0.5); border-radius: 0.625rem;">
                        <div id="progress-bar" style="width: 0%; height: 100%; background-color: #2ecc71; border-radius: 0.625rem; transition: width 0.2s linear;"></div>
                    </div>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                        <h2 id="message" style="font-size: 5rem; font-weight: bold;"></h2>
                        <button id="restart-button" style="display: none; padding: 1rem 2rem; font-size: 1.5rem; background-color: #ffd700; color: #1a1a1a; border: none; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem; pointer-events: auto;" data-motion-activatable>Restart</button>
                    </div>
                </div>
            </div>
        `;
    }

    onInit() {
        const { canvas, ctx } = this.setupCanvas('game-canvas');
        this.canvas = canvas;
        this.ctx = ctx;

        const uiLayer = this.container.querySelector('#ui-layer');
        this.viewport.applyTo(uiLayer);
        this.addManagedEventListener(window, 'viewport-updated', () => this.viewport.applyTo(uiLayer));

        this.motionEngine.setMode('pose');
        this.motionEngine.showPointer(true);

        this.ui = {
            messageEl: this.container.querySelector('#message'),
            restartBtn: this.container.querySelector('#restart-button'),
            progressBar: this.container.querySelector('#progress-bar')
        };
        
        this.addManagedEventListener(this.ui.restartBtn, 'click', () => this.startGame());
        this.listenToMotionResults();
        
        this.startGame();
    }

    onDestroy() {
        this.canvas = null;
        this.ctx = null;
        this.ui = {};
        console.log("[PathOfBalanceScene] Destroyed.");
    }

    startGame() {
        this.player = { x: this.DESIGN_WIDTH / 2, balanceForce: 0, progress: 0, width: 60 };
        this.balanceAngle = 0;
        this.isStepping = false;
        this.pathOffset = 0;
        this.gameState = 'playing';
        
        this.ui.messageEl.textContent = 'Keep your balance and step forward!';
        setTimeout(() => { if (this.ui.messageEl) this.ui.messageEl.textContent = ''; }, 3000);
        this.ui.restartBtn.style.display = 'none';
        if (this.ui.progressBar) this.ui.progressBar.style.width = '0%';
    }

    onUpdate() {
        if (this.latestResults && this.latestResults.poseLandmarks) {
            const landmarks = this.latestResults.poseLandmarks;
            const visibilityThreshold = 0.5;
            for (const key in this.smoothers) {
                const landmarkIndex = {leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26}[key];
                const rawPoint = (landmarks[landmarkIndex] && landmarks[landmarkIndex].visibility > visibilityThreshold) ? landmarks[landmarkIndex] : null;
                this.smoothedLandmarks[key] = this.smoothers[key].update(rawPoint);
            }
            if (this.gameState === 'playing') {
                const { leftShoulder, rightShoulder, leftHip, rightHip, leftKnee, rightKnee } = this.smoothedLandmarks;
                if (leftShoulder && rightShoulder && leftHip && rightHip) {
                    const shoulderMid = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
                    const hipMid = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
                    const angleRad = Math.atan2(shoulderMid.y - hipMid.y, shoulderMid.x - hipMid.x);
                    this.balanceAngle = (angleRad * 180 / Math.PI) + 90;
                    this.player.balanceForce = this.balanceAngle * -0.25;
                } else {
                    this.player.balanceForce *= 0.9;
                }
                if (leftKnee && rightKnee && leftHip && rightHip) {
                    const hipHeight = (leftHip.y + rightHip.y) / 2;
                    const isLeftStepping = leftKnee.y < hipHeight - 0.05;
                    const isRightStepping = rightKnee.y < hipHeight - 0.05;
                    if ((isLeftStepping || isRightStepping) && !this.isStepping) {
                        this.isStepping = true;
                        this.pathOffset += 25;
                        this.player.progress = (this.pathOffset / this.pathTotalLength) * 100;
                    } else if (!isLeftStepping && !isRightStepping) {
                        this.isStepping = false;
                    }
                }
                this.player.x += this.player.balanceForce;
                const w = this.DESIGN_WIDTH, h = this.DESIGN_HEIGHT;
                const horizonY = h * 0.6, pathWidthStart = w * 1.5, pathWidthEnd = w * 0.05, playerVerticalY = h * 0.9;
                const playerProgressRatio = (playerVerticalY - horizonY) / (h - horizonY);
                const pathWidthAtPlayer = pathWidthEnd + (pathWidthStart - pathWidthEnd) * playerProgressRatio;
                const pathLeftEdge = w / 2 - pathWidthAtPlayer / 2, pathRightEdge = w / 2 + pathWidthAtPlayer / 2;
                const playerLeftEdge = this.player.x - this.player.width / 2, playerRightEdge = this.player.x + this.player.width / 2;
                if (playerLeftEdge < pathLeftEdge || playerRightEdge > pathRightEdge) {
                    this.gameState = 'gameover'; this.ui.messageEl.textContent = 'You Fell!'; this.ui.restartBtn.style.display = 'block';
                }
                if (this.player.progress >= 100) {
                    this.gameState = 'win'; this.ui.messageEl.textContent = 'You Reached the End!'; this.ui.restartBtn.style.display = 'block';
                }
            }
        }
    }

    onDraw() {
        if (!this.ctx) return;
        const w = this.DESIGN_WIDTH, h = this.DESIGN_HEIGHT;
        this.ctx.clearRect(0, 0, w, h);
        const horizonY = h * 0.6, pathWidthStart = w * 1.5, pathWidthEnd = w * 0.05;
        this.ctx.beginPath();
        this.ctx.moveTo(w / 2 - pathWidthEnd / 2, horizonY); this.ctx.lineTo(w / 2 + pathWidthEnd / 2, horizonY);
        this.ctx.lineTo(w / 2 + pathWidthStart / 2, h); this.ctx.lineTo(w / 2 - pathWidthStart / 2, h);
        this.ctx.closePath(); this.ctx.fillStyle = '#95a5a6'; this.ctx.fill();
        this.ctx.strokeStyle = '#7f8c8d'; this.ctx.lineWidth = 5;
        const lineSpacing = 50, numLines = 20;
        for (let i = 0; i < numLines; i++) {
            const lineWorldY = (i * lineSpacing + this.pathOffset) % (numLines * lineSpacing);
            const lineScreenRatio = lineWorldY / (numLines * lineSpacing);
            const y = horizonY + (h - horizonY) * lineScreenRatio;
            const widthAtY = pathWidthEnd + (pathWidthStart - pathWidthEnd) * lineScreenRatio;
            this.ctx.beginPath(); this.ctx.moveTo(w / 2 - widthAtY / 2, y); this.ctx.lineTo(w / 2 + widthAtY / 2, y); this.ctx.stroke();
        }
        const playerBaseY = h * 0.9;
        this.ctx.save(); this.ctx.translate(this.player.x, playerBaseY); this.ctx.rotate(this.player.balanceForce * 0.05);
        this.ctx.strokeStyle = '#ffd700'; this.ctx.lineWidth = 8; this.ctx.lineCap = 'round';
        this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(0, -50); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.arc(0, -65, 15, 0, Math.PI * 2); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(0, -40); this.ctx.lineTo(-30, -20); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(0, -40); this.ctx.lineTo(30, -20); this.ctx.stroke();
        const stepOffset = this.isStepping ? 20 : 0;
        this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(-20, 30 + stepOffset); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(20, 30 - stepOffset); this.ctx.stroke();
        this.ctx.restore();
        if (this.ui.progressBar) { this.ui.progressBar.style.width = `${this.player.progress}%`; }
    }
}