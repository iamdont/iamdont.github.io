// src/scenes/shape-deformer-scene.js

export class ShapeDeformerScene {
    constructor() {
        this.loopHandle = null;
        this.resultsListener = null;
        this.canvas = null; this.ctx = null; this.latestResults = null;
        this.shapePoints = []; this.pointRadius = 20;

        // === 核心修改 1：為每隻手加入容錯計數器 ===
        this.hands = {
            left: { isPinching: false, grabbedPointIndex: -1, isHovering: false, pinchMissFrames: 0 },
            right: { isPinching: false, grabbedPointIndex: -1, isHovering: false, pinchMissFrames: 0 }
        };
        this.PINCH_MISS_TOLERANCE = 3; // 連續 3 幀偵測唔到先當放手
        // ===========================================
    }

    render() {
        return `
            <style>
                .sd-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #2c3e50; }
                .sd-scene #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .sd-scene #info-panel { position: absolute; top: 80px; left: 20px; z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; }
            </style>
            <div class="sd-scene">
                <a class="back-button" data-scene-changer="launcher" data-motion-activatable>
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

    init() {
        window.motionEngine.setMode('holistic');
        window.motionEngine.outputCanvas.style.display = 'none'; // 呢個場景唔需要黃點
        this.canvas = document.getElementById('game-canvas'); this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
        this.ui = { leftStatus: document.getElementById('left-hand-status'), rightStatus: document.getElementById('right-hand-status') };
        this.resetShape(); this._bindEvents(); this.gameLoop();
    }

    destroy() {
        if (this.loopHandle) cancelAnimationFrame(this.loopHandle);
        window.motionEngine.setMode('hands');
        const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } };
        removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener);
    }
    
    resetShape() {
        this.shapePoints = []; const w = this.canvas.width; const h = this.canvas.height;
        const centerX = w / 2, centerY = h / 2; const radius = Math.min(w, h) * 0.2;
        const sides = 5; for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            this.shapePoints.push({ x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) });
        }
    }

    _bindEvents() {
        document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger));
        this.resultsListener = (results) => { this.latestResults = results; };
        window.motionEngine.on('results-updated', this.resultsListener);
    }
    
    // === 核心修改 2：加入容錯邏輯 ===
    update() {
        if (!this.latestResults) return;

        const w = this.canvas.width, h = this.canvas.height;
        const results = this.latestResults;
        const handLandmarks = { left: results.leftHandLandmarks, right: results.rightHandLandmarks };

        ['left', 'right'].forEach(hand => {
            const state = this.hands[hand];
            const landmarks = handLandmarks[hand];
            const wasPinching = state.isPinching;
            
            // 判斷當前幀係咪捏合
            const isCurrentlyPinching = window.isPinching(landmarks);

            // 更新容錯計數器
            if (isCurrentlyPinching) {
                state.pinchMissFrames = 0; // 如果捏合，計數器清零
            } else {
                state.pinchMissFrames++; // 如果冇捏合，計數器加一
            }
            
            // 更新最終嘅 isPinching 狀態
            // 如果之前係捏合緊，只有當連續幾幀都冇捏合，先會真正放手
            if (state.isPinching) {
                if (state.pinchMissFrames > this.PINCH_MISS_TOLERANCE) {
                    state.isPinching = false;
                }
            } else {
                state.isPinching = isCurrentlyPinching;
            }

            // ... 後面嘅邏輯大部分不變 ...
            state.isHovering = false;
            const pointer = window.motionEngine.pointers.find(p => p.hand === hand);
            if (!pointer || !pointer.isVisible) { if (state.grabbedPointIndex !== -1) { state.grabbedPointIndex = -1; } state.isPinching = false; return; }
            const pointerScreenX = (1 - pointer.x) * w; const pointerScreenY = pointer.y * h;

            if (state.grabbedPointIndex !== -1) {
                if (state.isPinching) {
                    this.shapePoints[state.grabbedPointIndex].x = pointerScreenX;
                    this.shapePoints[state.grabbedPointIndex].y = pointerScreenY;
                } else {
                    state.grabbedPointIndex = -1;
                }
            } else {
                state.hoveringPointIndex = -1; // 重置
                for (let i = 0; i < this.shapePoints.length; i++) {
                    const point = this.shapePoints[i];
                    const distance = Math.hypot(pointerScreenX - point.x, pointerScreenY - point.y);
                    if (distance < this.pointRadius * 1.5) {
                        state.hoveringPointIndex = i;
                        state.isHovering = true;
                        // 如果喺懸停時開始捏合（由非捏合變為捏合），就抓取
                        if (state.isPinching && !wasPinching) {
                            state.grabbedPointIndex = i;
                        }
                        break;
                    }
                }
            }
            let statusText = `${hand}: `; if(state.grabbedPointIndex !== -1) statusText += `抓取緊點 ${state.grabbedPointIndex}`; else if(state.isHovering) statusText += `懸停喺點 ${state.hoveringPointIndex}`; else statusText += (state.isPinching ? '捏合' : '張開');
            this.ui[`${hand}Status`].textContent = statusText;
        });
    }
    
    // === 核心修改 3：加入骨架繪製 ===
    draw() {
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        if (this.latestResults && this.latestResults.image) {
            this.ctx.save(); this.ctx.globalAlpha = 0.3; this.ctx.translate(w, 0); this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.latestResults.image, 0, 0, w, h);
            this.ctx.restore();
        }

        // 畫骨架
        if (this.latestResults) {
            this.ctx.save(); this.ctx.globalAlpha = 0.5; this.ctx.translate(w, 0); this.ctx.scale(-1, 1);
            const drawHand = (landmarks, color) => {
                if (landmarks) {
                    drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 });
                    drawLandmarks(this.ctx, landmarks, { color, radius: 3 });
                }
            }
            drawHand(this.latestResults.leftHandLandmarks, '#00FFFF'); // 左青
            drawHand(this.latestResults.rightHandLandmarks, '#FFD700'); // 右黃
            this.ctx.restore();
        }

        // 畫圖形嘅連線
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; this.ctx.lineWidth = 3;
        this.ctx.beginPath(); this.ctx.moveTo(this.shapePoints[0].x, this.shapePoints[0].y);
        for (let i = 1; i < this.shapePoints.length; i++) { this.ctx.lineTo(this.shapePoints[i].x, this.shapePoints[i].y); }
        this.ctx.closePath(); this.ctx.stroke();

        // 畫圖形嘅頂點
        this.shapePoints.forEach((point, i) => {
            const isLeftGrabbed = this.hands.left.grabbedPointIndex === i; const isRightGrabbed = this.hands.right.grabbedPointIndex === i;
            const isLeftHovering = this.hands.left.hoveringPointIndex === i && this.hands.left.isHovering;
            const isRightHovering = this.hands.right.hoveringPointIndex === i && this.hands.right.isHovering;
            let color = '#3498db';
            if(isLeftGrabbed) color = '#00FFFF'; else if(isRightGrabbed) color = '#FFD700';
            else if(isLeftHovering || isRightHovering) color = '#e74c3c';
            this.ctx.fillStyle = color; this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, this.pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    gameLoop() { this.update(); this.draw(); this.loopHandle = requestAnimationFrame(() => this.gameLoop()); }
}