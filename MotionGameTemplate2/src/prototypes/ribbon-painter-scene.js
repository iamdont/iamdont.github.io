// src/prototypes/ribbon-painter-scene.js
import { BaseScene } from '../core/base-scene.js';

class GestureRecognizer {
    static isFist(handLandmarks) {
        if (!handLandmarks) return false;
        try {
            const wrist = handLandmarks[0];
            const isIndexCurled = this.distance(handLandmarks[8], wrist) < this.distance(handLandmarks[5], wrist);
            const isMiddleCurled = this.distance(handLandmarks[12], wrist) < this.distance(handLandmarks[9], wrist);
            const isRingCurled = this.distance(handLandmarks[16], wrist) < this.distance(handLandmarks[13], wrist);
            const isPinkyCurled = this.distance(handLandmarks[20], wrist) < this.distance(handLandmarks[17], wrist);
            return isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;
        } catch (e) {
            return false;
        }
    }
    static distance(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
}

class Ribbon {
    constructor(color) {
        this.points = [];
        this.color = color;
        this.MAX_POINTS = 100;
    }

    addPoint(x, y, speed) {
        const width = 2 + speed * 2;
        const opacity = Math.min(1, 0.1 + speed / 50);
        this.points.push({ x, y, width, opacity });
        if (this.points.length > this.MAX_POINTS) {
            this.points.shift();
        }
    }

    draw(ctx) {
        if (this.points.length < 2) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < this.points.length; i++) {
            const p1 = this.points[i - 1];
            const p2 = this.points[i];
            // 根據點嘅透明度和喺隊列中嘅位置計算最終透明度
            const alpha = p2.opacity * (i / this.points.length);
            ctx.strokeStyle = this.color.replace('%a', alpha);
            ctx.lineWidth = p2.width;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }

    clear() {
        this.points = [];
    }
}

export class RibbonPainterScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.hands = {
            left: { ribbon: new Ribbon('rgba(0, 255, 255, %a)'), history: [], isDrawing: false },
            right: { ribbon: new Ribbon('rgba(255, 215, 0, %a)'), history: [], isDrawing: false }
        };
        this.HISTORY_LENGTH = 5;
    }
    
    renderHTML() {
        // data-scene-changer 路徑修正
        return `
            <style>
                .rp-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #0a0a1a; cursor: none; }
                .rp-scene #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .rp-scene #info-panel { position: absolute; top: 80px; left: 20px; z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; }
                .rp-scene #clear-button { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); padding: 15px 30px; font-size: 1.2em; background-color: #c0392b; color: white; border: none; border-radius: 10px; z-index: 4; pointer-events: auto; }
            </style>
            <div class="rp-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="game-canvas"></canvas>
                <div id="info-panel">
                    <p>揸緊拳頭開始畫畫</p>
                    <p>張開手掌停止</p>
                </div>
                <button id="clear-button" data-motion-activatable>清除畫布</button>
            </div>
        `;
    }

    onInit() {
        this.motionEngine.setMode('holistic');
        this.motionEngine.outputCanvas.style.display = 'block';

        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.addManagedEventListener(document.getElementById('clear-button'), 'click', () => {
            this.hands.left.ribbon.clear();
            this.hands.right.ribbon.clear();
        });

        this.listenToMotionResults();
    }

    onDestroy() {
        this.canvas = null;
        this.ctx = null;
        this.hands = null; // 釋放對象引用
        console.log("[RibbonPainterScene] Destroyed.");
    }

    onUpdate() {
        if (!this.latestResults) return;

        const pointers = this.motionEngine.pointers;
        const handLandmarks = {
            left: this.latestResults.leftHandLandmarks,
            right: this.latestResults.rightHandLandmarks
        };

        ['left', 'right'].forEach(hand => {
            const state = this.hands[hand];
            const pointer = pointers.find(p => p.hand === hand);
            const landmarks = handLandmarks[hand];
            
            const isCurrentlyFist = GestureRecognizer.isFist(landmarks);

            if (!state.isDrawing && isCurrentlyFist) {
                // 開始畫畫時清空歷史記錄，避免畫出一條長線
                state.history = [];
            }
            state.isDrawing = isCurrentlyFist;

            if (pointer && pointer.isVisible) {
                const x = (1 - pointer.x) * this.canvas.width;
                const y = pointer.y * this.canvas.height;
                
                // 計算速度
                let speed = 0;
                if (state.history.length > 1) {
                    const last = state.history[state.history.length - 1];
                    speed = Math.hypot(x - last.x, y - last.y);
                }
                
                // 更新歷史記錄
                state.history.push({ x, y });
                if (state.history.length > this.HISTORY_LENGTH) {
                    state.history.shift();
                }

                if (state.isDrawing) {
                    state.ribbon.addPoint(x, y, speed);
                }
            }
        });
    }

    onDraw() {
        if (!this.ctx) return;
        
        // 用半透明黑色背景製造拖影效果
        this.ctx.fillStyle = 'rgba(10, 10, 26, 0.2)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製骨架
        if (this.latestResults) {
            this.ctx.save();
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);
            this.ctx.globalAlpha = 0.4;
            
            const drawHand = (landmarks, color) => {
                if (landmarks) {
                    drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 });
                    drawLandmarks(this.ctx, landmarks, { color, radius: 3 });
                }
            };
            drawHand(this.latestResults.leftHandLandmarks, '#00FFFF');
            drawHand(this.latestResults.rightHandLandmarks, '#FFD700');
            
            this.ctx.restore();
        }

        // 繪製絲帶
        this.hands.left.ribbon.draw(this.ctx);
        this.hands.right.ribbon.draw(this.ctx);
    }
}