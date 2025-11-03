// src/motion-engine.js

window.getPalmCenterFromPose = function(landmarks, hand = 'right') { /* ... 不變 ... */ if (!landmarks) return null; const isLeft = hand === 'left'; const wristIdx = isLeft ? 15 : 16; const pinkyIdx = isLeft ? 17 : 18; const indexIdx = isLeft ? 19 : 20; const wrist = landmarks[wristIdx], pinky = landmarks[pinkyIdx], index = landmarks[indexIdx]; if (wrist && pinky && index && wrist.visibility > 0.3 && pinky.visibility > 0.3 && index.visibility > 0.3) { return { x: (wrist.x + pinky.x + index.x) / 3, y: (wrist.y + pinky.y + index.y) / 3 }; } return null; }

// === 核心修改 1：修正 PointSmoother 嘅行為 ===
class PointSmoother {
    constructor(smoothingFactor = 0.8) {
        this.smoothingFactor = smoothingFactor;
        this.smoothedPoint = null;
        this.lastUpdateTime = 0;
        this.timeout = 100; // 如果 100ms 內冇新數據，就判斷為消失
    }

    update(rawPoint) {
        const now = performance.now();
        
        if (rawPoint) {
            this.lastUpdateTime = now; // 記錄收到有效數據嘅時間
            if (!this.smoothedPoint) {
                this.smoothedPoint = { ...rawPoint };
            } else {
                this.smoothedPoint.x = this.smoothingFactor * this.smoothedPoint.x + (1 - this.smoothingFactor) * rawPoint.x;
                this.smoothedPoint.y = this.smoothingFactor * this.smoothedPoint.y + (1 - this.smoothingFactor) * rawPoint.y;
            }
            return this.smoothedPoint;
        } else {
            // 如果冇收到新數據，並且超過咗 timeout
            if (now - this.lastUpdateTime > this.timeout) {
                this.smoothedPoint = null; // 將儲存嘅點清除
            }
            return this.smoothedPoint; // 返回 null 或者最後一個點
        }
    }

    reset() {
        this.smoothedPoint = null;
        this.lastUpdateTime = 0;
    }
}
// ============================================

export class MotionEngine {
    // ... MotionEngine 嘅代碼同上次完全一樣，不變 ...
    constructor() { this.currentMode = null; this.detector = null; this.camera = null; this.isRunning = false; this.videoElement = null; this.outputCanvas = null; this.canvasCtx = null; this.results = {}; this.eventListeners = new Map(); this.pointers = [ { id: 0, hand: 'left', x: 0, y: 0, isVisible: false, smoother: new PointSmoother(0.7), dwell: { element: null, startTime: 0, timer: null } }, { id: 1, hand: 'right', x: 0, y: 0, isVisible: false, smoother: new PointSmoother(0.7), dwell: { element: null, startTime: 0, timer: null } } ]; this.pointer = { x: 0, y: 0, isVisible: false }; this.ACTIVATION_THRESHOLD = 2000; this.lastActivationTime = 0; }
    async initialize() { if (this.camera) return; this._createEngineElements(); this.camera = new Camera(this.videoElement, { onFrame: async () => { if (this.detector && this.videoElement.readyState === 4) { await this.detector.send({ image: this.videoElement }); } }, width: 1280, height: 720 }); await this.camera.start(); this.isRunning = true; this._gameLoop(); }
    async setMode(newMode) { if (this.currentMode === newMode) return; console.log(`[MotionEngine] Switching mode to '${newMode}'...`); this.currentMode = newMode; this.detector = null; this.pointers.forEach(p => p.smoother.reset()); if (newMode === null || newMode === 'none') { this.emit('mode-changed', null); return; } const options = { locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/${newMode}/${file}` }; switch (newMode) { case 'hands': this.detector = new Hands(options); this.detector.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 }); break; case 'pose': this.detector = new Pose(options); this.detector.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 }); break; case 'holistic': this.detector = new Holistic(options); this.detector.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.7 }); break; default: console.error(`Unsupported mode: ${newMode}`); this.currentMode = null; return; } this.detector.onResults(results => this._onResults(results)); this.emit('mode-changed', newMode); }
    setPointerHand(hand) {}
    on(eventName, callback) { if (!this.eventListeners.has(eventName)) { this.eventListeners.set(eventName, []); } this.eventListeners.get(eventName).push(callback); }
    emit(eventName, data) { if (this.eventListeners.has(eventName)) { this.eventListeners.get(eventName).forEach(callback => callback(data)); } }
    _createEngineElements() { this.videoElement = document.createElement('video'); this.videoElement.id = 'motion-engine-video'; this.videoElement.style.display = 'none'; document.body.appendChild(this.videoElement); this.outputCanvas = document.createElement('canvas'); this.outputCanvas.id = 'motion-engine-canvas'; this.outputCanvas.width = window.innerWidth; this.outputCanvas.height = window.innerHeight; this.canvasCtx = this.outputCanvas.getContext('2d'); Object.assign(this.outputCanvas.style, { position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: '9999', pointerEvents: 'none', transform: 'scaleX(-1)', display: 'none' }); document.body.appendChild(this.outputCanvas); window.addEventListener('resize', () => { this.outputCanvas.width = window.innerWidth; this.outputCanvas.height = window.innerHeight; }); }
    _onResults(results) { this.results = results; this._updatePointers(results); this.emit('results-updated', results); }
    _updatePointers(results) { let handData = this.getHandsData(results); this.pointers.forEach(p => { const rawPoint = handData[p.hand]; const smoothedPoint = p.smoother.update(rawPoint); let wasVisible = p.isVisible; if (smoothedPoint) { p.x = smoothedPoint.x; p.y = smoothedPoint.y; p.isVisible = true; } else { p.isVisible = false; } if (p.isVisible || wasVisible) { this.emit('pointer-updated', { hand: p.hand, x: p.x, y: p.y, isVisible: p.isVisible }); } }); const activePointer = this.pointers.find(p => p.isVisible && p.hand === 'right') || this.pointers.find(p => p.isVisible); if (activePointer) { this.pointer.x = (1 - activePointer.x) * window.innerWidth; this.pointer.y = activePointer.y * window.innerHeight; this.pointer.isVisible = true; } else { this.pointer.isVisible = false; } }
    getHandsData(results) { let hands = { left: null, right: null }; if (this.currentMode === 'hands' && results.multiHandLandmarks && results.multiHandedness) { for (let i = 0; i < results.multiHandLandmarks.length; i++) { if(results.multiHandedness[i]) { const hand = results.multiHandedness[i].label.toLowerCase(); const target = results.multiHandLandmarks[i][8]; if (target) hands[hand] = { x: target.x, y: target.y }; } } } else if (this.currentMode === 'holistic') { if (results.leftHandLandmarks) { const target = results.leftHandLandmarks[8]; if (target) hands.left = { x: target.x, y: target.y }; } if (results.rightHandLandmarks) { const target = results.rightHandLandmarks[8]; if (target) hands.right = { x: target.x, y: target.y }; } } else if (this.currentMode === 'pose' && results.poseLandmarks) { hands.left = window.getPalmCenterFromPose(results.poseLandmarks, 'left'); hands.right = window.getPalmCenterFromPose(results.poseLandmarks, 'right'); } return hands; }
    _updateHoverAndActivation() { const now = performance.now(); if (now - this.lastActivationTime < 500) { this.pointers.forEach(p => this._clearDwell(p)); return; } const activatableElements = document.querySelectorAll('[data-motion-activatable]'); this.pointers.forEach(p => { if (!p.isVisible) { this._clearDwell(p); return; } const screenX = (1 - p.x) * window.innerWidth; const screenY = p.y * window.innerHeight; let currentlyHovered = null; for (const el of activatableElements) { const rect = el.getBoundingClientRect(); if (screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom) { currentlyHovered = el; break; } } if (p.dwell.element !== currentlyHovered) { this._clearDwell(p); if (currentlyHovered) { p.dwell.element = currentlyHovered; p.dwell.element.classList.add('motion-hover'); p.dwell.startTime = performance.now(); p.dwell.timer = setTimeout(() => { this.lastActivationTime = performance.now(); p.dwell.element.click(); this._clearDwell(p); }, this.ACTIVATION_THRESHOLD); } } }); const anyElementHovered = this.pointers.some(p => p.dwell.element !== null); if (!anyElementHovered) { document.querySelectorAll('.motion-hover').forEach(el => el.classList.remove('motion-hover')); } }
    _clearDwell(pointer) { if (pointer.dwell.element) { pointer.dwell.element.classList.remove('motion-hover'); } if (pointer.dwell.timer) { clearTimeout(pointer.dwell.timer); } pointer.dwell = { element: null, startTime: 0, timer: null }; }
    _drawPointer() { const ctx = this.canvasCtx; ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); this.pointers.forEach(p => { if (!p.isVisible) return; const drawX = p.x * ctx.canvas.width; const drawY = p.y * ctx.canvas.height; const color = p.hand === 'left' ? 'rgba(0, 255, 255, 1)' : 'rgba(255, 215, 0, 1)'; if (p.dwell.element) { const elapsedTime = performance.now() - p.dwell.startTime; const progress = Math.min(elapsedTime / this.ACTIVATION_THRESHOLD, 1); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); const radius = 20; ctx.arc(drawX, drawY, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress); ctx.stroke(); } ctx.fillStyle = color.replace('1)', '0.7)'); ctx.beginPath(); ctx.arc(drawX, drawY, 15, 0, 2 * Math.PI); ctx.fill(); }); }
    _gameLoop() { if (!this.isRunning) return; this._updateHoverAndActivation(); if(this.outputCanvas.style.display !== 'none') { this._drawPointer(); } requestAnimationFrame(() => this._gameLoop()); }
}