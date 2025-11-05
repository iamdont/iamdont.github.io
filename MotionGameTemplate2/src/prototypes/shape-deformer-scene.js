// src/prototypes/shape-deformer-scene.js (更新後)
// 將控制點從 5 個增加到 8 個

import { BaseScene } from '../core/base-scene.js';

class GestureHelper {
    constructor(framesToConfirm = 3) {
        this.framesToConfirm = framesToConfirm;
        this.currentGesture = 'none';
        this.potentialGesture = 'none';
        this.confirmCounter = 0;
    }

    update(isPinchingNow) {
        const gesture = isPinchingNow ? 'pinching' : 'open';

        if (gesture === this.potentialGesture) {
            this.confirmCounter++;
        } else {
            this.potentialGesture = gesture;
            this.confirmCounter = 1;
        }

        if (this.confirmCounter >= this.framesToConfirm) {
            this.currentGesture = this.potentialGesture;
        }
        
        return this.currentGesture;
    }

    isPinchingStable() {
        return this.currentGesture === 'pinching';
    }
}


export class ShapeDeformerScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.ui = {};
        
        this.shapePoints = [];
        this.pointRadius = 20;
        
        this.hands = {
            left: { gestureHelper: new GestureHelper(), grabbedPointIndex: -1 },
            right: { gestureHelper: new GestureHelper(), grabbedPointIndex: -1 }
        };
    }

    renderHTML() {
        return `
            <style>
                .sd-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #2c3e50; }
                .sd-scene #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .sd-scene #info-panel { position: absolute; top: 80px; left: 20px; z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; }
            </style>
            <div class="sd-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="game-canvas"></canvas>
                <div id="info-panel">
                    <p>用拇指同食指「捏」住圓點拖動</p>
                    <div id="left-hand-status">左手: -</div>
                    <div id="right-hand-status">右手: -</div>
                </div>
            </div>
        `;
    }

    onInit() {
        this.motionEngine.setMode('holistic');
        this.motionEngine.showPointer(true);

        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.ui = {
            leftStatus: document.getElementById('left-hand-status'),
            rightStatus: document.getElementById('right-hand-status')
        };
        
        this.resetShape();
        this.listenToMotionResults();
    }

    onDestroy() {
        this.canvas = null;
        this.ctx = null;
        this.ui = {};
        this.shapePoints = [];
        console.log("[ShapeDeformerScene] Destroyed.");
    }

    resetShape() {
        const w = this.canvas.width, h = this.canvas.height;
        const centerX = w / 2, centerY = h / 2;
        const radius = Math.min(w, h) * 0.25; // 可以稍微放大個半徑
        
        // --- 主要修改處 ---
        const sides = 8; // 將 5 改為 8
        // ------------------

        this.shapePoints = [];
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            this.shapePoints.push({
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
                grabbedBy: null
            });
        }
    }

    onUpdate() {
        if (!this.latestResults) return;

        const w = this.canvas.width, h = this.canvas.height;
        const landmarksData = {
            left: this.latestResults.leftHandLandmarks,
            right: this.latestResults.rightHandLandmarks
        };

        const handPointers = {
            left: this.motionEngine.pointers.find(p => p.hand === 'left'),
            right: this.motionEngine.pointers.find(p => p.hand === 'right')
        };

        ['left', 'right'].forEach(hand => {
            const state = this.hands[hand];
            const landmarks = landmarksData[hand];
            const pointer = handPointers[hand];

            const isPinchingNow = window.isPinching(landmarks);
            state.gestureHelper.update(isPinchingNow);
            const isPinchingStable = state.gestureHelper.isPinchingStable();

            let statusText = `${hand}: ${isPinchingStable ? '捏合 (穩定)' : '張開'}`;

            if (isPinchingStable) {
                if (state.grabbedPointIndex === -1) {
                    if (pointer && pointer.isVisible) {
                        const pointerX = (1 - pointer.x) * w;
                        const pointerY = pointer.y * h;
                        
                        let closestDist = Infinity;
                        let targetIndex = -1;
                        for (let i = 0; i < this.shapePoints.length; i++) {
                            const point = this.shapePoints[i];
                            if (point.grabbedBy) continue;

                            const dist = Math.hypot(pointerX - point.x, pointerY - point.y);
                            if (dist < this.pointRadius * 1.5 && dist < closestDist) {
                                closestDist = dist;
                                targetIndex = i;
                            }
                        }

                        if (targetIndex !== -1) {
                            state.grabbedPointIndex = targetIndex;
                            this.shapePoints[targetIndex].grabbedBy = hand;
                        }
                    }
                }
            } else {
                if (state.grabbedPointIndex !== -1) {
                    this.shapePoints[state.grabbedPointIndex].grabbedBy = null;
                    state.grabbedPointIndex = -1;
                }
            }

            if (state.grabbedPointIndex !== -1 && pointer && pointer.isVisible) {
                const pointerX = (1 - pointer.x) * w;
                const pointerY = pointer.y * h;
                this.shapePoints[state.grabbedPointIndex].x = pointerX;
                this.shapePoints[state.grabbedPointIndex].y = pointerY;
                statusText = `${hand}: 抓取緊點 ${state.grabbedPointIndex}`;
            }
            
            this.ui[`${hand}Status`].textContent = statusText;
        });
    }

    onDraw() {
        if (!this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        if (this.latestResults) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3;
            this.ctx.translate(w, 0);
            this.ctx.scale(-1, 1);
            if (this.latestResults.image) this.ctx.drawImage(this.latestResults.image, 0, 0, w, h);
            
            const drawHand = (landmarks, color) => {
                if (landmarks) {
                    drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 });
                    drawLandmarks(this.ctx, landmarks, { color, radius: 3 });
                }
            };
            drawHand(this.latestResults.leftHandLandmarks, '#0FF');
            drawHand(this.latestResults.rightHandLandmarks, '#FFD700');
            this.ctx.restore();
        }

        if (this.shapePoints.length > 1) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, .8)';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(this.shapePoints[0].x, this.shapePoints[0].y);
            for (let i = 1; i < this.shapePoints.length; i++) {
                this.ctx.lineTo(this.shapePoints[i].x, this.shapePoints[i].y);
            }
            this.ctx.closePath();
            this.ctx.stroke();
        }

        this.shapePoints.forEach((point, i) => {
            let color = '#3498db';
            if (point.grabbedBy === 'left') {
                color = '#0FF';
            } else if (point.grabbedBy === 'right') {
                color = '#FFD700';
            }
            
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, this.pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
}