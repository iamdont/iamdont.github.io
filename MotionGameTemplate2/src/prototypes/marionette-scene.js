// src/prototypes/marionette-scene.js (更新後)
// [FIX #1] 啟用指針，以便操作返回按鈕

import { BaseScene } from '../core/base-scene.js';

class PointSmoother2D {
    constructor(smoothingFactor = 0.8) {
        this.smoothingFactor = smoothingFactor;
        this.point = null;
    }
    update(rawPoint) {
        if (rawPoint) {
            if (this.point) {
                this.point.x = this.smoothingFactor * this.point.x + (1 - this.smoothingFactor) * rawPoint.x;
                this.point.y = this.smoothingFactor * this.point.y + (1 - this.smoothingFactor) * rawPoint.y;
            } else {
                this.point = { ...rawPoint };
            }
            return this.point;
        }
        return null;
    }
}

export class MarionetteScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.character = null;
        
        this.targets = { leftHand: null, rightHand: null, leftFoot: null, rightFoot: null };
        this.smoothers = {
            leftHand: new PointSmoother2D(0.6),
            rightHand: new PointSmoother2D(0.6),
            leftFoot: new PointSmoother2D(0.6),
            rightFoot: new PointSmoother2D(0.6)
        };
    }

    renderHTML() {
        return `
            <style>
                .marionette-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #1a1a1a; }
                #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
            </style>
            <div class="marionette-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="game-canvas"></canvas>
            </div>
        `;
    }

    onInit() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.motionEngine.setMode('pose');
        // [FIX #1] 顯示指針畫布，確保返回按鈕可以被觸發
        this.motionEngine.showPointer(true);

        this.addManagedEventListener(window, 'resize', () => this.resizeAndReset());
        this.listenToMotionResults();
        
        this.resizeAndReset();
    }
    
    resizeAndReset() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this._createCharacter();
    }

    onDestroy() {
        this.canvas = null;
        this.ctx = null;
        this.character = null;
        console.log("[MarionetteScene] Destroyed.");
    }
    
    _createCharacter() {
        const w = this.canvas.width, h = this.canvas.height;
        const torsoHeight = h * 0.22;
        const shoulderWidth = w * 0.1;
        const armLength = h * 0.25;
        const legLength = h * 0.3;
        const neckY = h * 0.3;
        const hipY = neckY + torsoHeight;
        const centerX = w / 2;

        this.character = {
            head: { x: centerX, y: neckY - (h * 0.04) },
            neck: { x: centerX, y: neckY },
            hip: { x: centerX, y: hipY },
            leftArm: {
                chain: [{ x: centerX - shoulderWidth / 2, y: neckY }, { x: centerX - shoulderWidth / 2, y: neckY + armLength / 2 }, { x: centerX - shoulderWidth / 2, y: neckY + armLength }],
                lengths: [armLength / 2, armLength / 2]
            },
            rightArm: {
                chain: [{ x: centerX + shoulderWidth / 2, y: neckY }, { x: centerX + shoulderWidth / 2, y: neckY + armLength / 2 }, { x: centerX + shoulderWidth / 2, y: neckY + armLength }],
                lengths: [armLength / 2, armLength / 2]
            },
            leftLeg: {
                chain: [{ x: centerX - shoulderWidth / 4, y: hipY }, { x: centerX - shoulderWidth / 4, y: hipY + legLength / 2 }, { x: centerX - shoulderWidth / 4, y: hipY + legLength }],
                lengths: [legLength / 2, legLength / 2]
            },
            rightLeg: {
                chain: [{ x: centerX + shoulderWidth / 4, y: hipY }, { x: centerX + shoulderWidth / 4, y: hipY + legLength / 2 }, { x: centerX + shoulderWidth / 4, y: hipY + legLength }],
                lengths: [legLength / 2, legLength / 2]
            },
        };
    }
    
    onUpdate() {
        this._updateTargets();
        if (!this.character) return;
        this.solveIK(this.character.leftArm, this.targets.leftHand);
        this.solveIK(this.character.rightArm, this.targets.rightHand);
        this.solveIK(this.character.leftLeg, this.targets.leftFoot);
        this.solveIK(this.character.rightLeg, this.targets.rightFoot);
    }
    
    _updateTargets() {
        if (!this.latestResults || !this.latestResults.poseLandmarks) return;
        
        const w = this.canvas.width, h = this.canvas.height;
        const landmarks = this.latestResults.poseLandmarks;
        const getPoint = (index) => {
            if (!landmarks[index] || landmarks[index].visibility < 0.3) return null;
            return { x: (1 - landmarks[index].x) * w, y: landmarks[index].y * h };
        };

        const targetPoints = {
            leftHand: getPoint(15), rightHand: getPoint(16),
            leftFoot: getPoint(27), rightFoot: getPoint(28)
        };

        for (const key in this.targets) {
            this.targets[key] = this.smoothers[key].update(targetPoints[key]);
        }
    }

    solveIK(limb, target) {
        if (!limb || !target) return;
        const chain = limb.chain;
        const lengths = limb.lengths;
        const numJoints = chain.length;
        const root = { x: chain[0].x, y: chain[0].y };

        for (let iter = 0; iter < 5; iter++) {
            chain[numJoints - 1] = { x: target.x, y: target.y };
            for (let i = numJoints - 2; i >= 0; i--) {
                const dir = { x: chain[i + 1].x - chain[i].x, y: chain[i + 1].y - chain[i].y };
                const dist = Math.hypot(dir.x, dir.y) || 1;
                const ratio = lengths[i] / dist;
                chain[i] = {
                    x: chain[i + 1].x - dir.x * ratio,
                    y: chain[i + 1].y - dir.y * ratio,
                };
            }

            chain[0] = { x: root.x, y: root.y };
            for (let i = 0; i < numJoints - 1; i++) {
                if (i === 0 && chain.length > 2) {
                    const elbow = chain[1];
                    const shoulder = chain[0];
                    if (elbow.y < shoulder.y) elbow.y = shoulder.y + 1;
                }
                const dir = { x: chain[i + 1].x - chain[i].x, y: chain[i + 1].y - chain[i].y };
                const dist = Math.hypot(dir.x, dir.y) || 1;
                const ratio = lengths[i] / dist;
                chain[i + 1] = {
                    x: chain[i].x + dir.x * ratio,
                    y: chain[i].y + dir.y * ratio,
                };
            }
        }
    }

    onDraw() {
        if (!this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        if (this.latestResults) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.4;
            this.ctx.translate(w, 0);
            this.ctx.scale(-1, 1);
            if (this.latestResults.image) this.ctx.drawImage(this.latestResults.image, 0, 0, w, h);
            if (this.latestResults.poseLandmarks) {
                drawConnectors(this.ctx, this.latestResults.poseLandmarks, POSE_CONNECTIONS, { color: 'rgba(255,255,255,.5)', lineWidth: 2 });
            }
            this.ctx.restore();
        }

        if (!this.character) return;
        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = '#00FF00';
        this.ctx.lineWidth = 12;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        const { head, neck, hip, leftArm, rightArm, leftLeg, rightLeg } = this.character;
        
        this.ctx.beginPath(); this.ctx.moveTo(neck.x, neck.y); this.ctx.lineTo(hip.x, hip.y); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.arc(head.x, head.y, 30, 0, Math.PI * 2); this.ctx.stroke();
        
        const drawLimb = (limb) => {
            if (!limb || !limb.chain) return;
            const chain = limb.chain;
            this.ctx.beginPath();
            this.ctx.moveTo(chain[0].x, chain[0].y);
            for (let i = 1; i < chain.length; i++) this.ctx.lineTo(chain[i].x, chain[i].y);
            this.ctx.stroke();
        };
        
        drawLimb(leftArm); drawLimb(rightArm);
        drawLimb(leftLeg); drawLimb(rightLeg);
    }
}