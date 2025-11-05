// src/motion-engine.js (更新後)
// [FIX #1, #3, #4] 核心引擎功能增強

// 全局輔助函數，降低 getPalmCenterFromPose 嘅可見度門檻，令指針更穩定
window.getPalmCenterFromPose = function(landmarks, hand = 'right') { if (!landmarks) return null; const isLeft = hand === 'left'; const wristIdx = isLeft ? 15 : 16; const pinkyIdx = isLeft ? 17 : 18; const indexIdx = isLeft ? 19 : 20; const wrist = landmarks[wristIdx], pinky = landmarks[pinkyIdx], index = landmarks[indexIdx]; if (wrist && pinky && index && wrist.visibility > 0.2 && pinky.visibility > 0.2 && index.visibility > 0.2) { return { x: (wrist.x + pinky.x + index.x) / 3, y: (wrist.y + pinky.y + index.y) / 3 }; } return null; }
window.isPinching = function(handLandmarks, threshold = 0.04) { if (!handLandmarks || handLandmarks.length < 9) { return false; } const thumbTip = handLandmarks[4]; const indexTip = handLandmarks[8]; const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y); return distance < threshold; }

class PointSmoother {
    constructor(smoothingFactor = 0.8) { this.smoothingFactor = smoothingFactor; this.smoothedPoint = null; this.lastUpdateTime = 0; this.timeout = 100; }
    // [FIX #3] 新增 setFactor 方法
    setFactor(factor) { this.smoothingFactor = Math.max(0, Math.min(1, factor)); }
    update(rawPoint) { const now = performance.now(); if (rawPoint) { this.lastUpdateTime = now; if (!this.smoothedPoint) this.smoothedPoint = { ...rawPoint }; else { this.smoothedPoint.x = this.smoothingFactor * this.smoothedPoint.x + (1 - this.smoothingFactor) * rawPoint.x; this.smoothedPoint.y = this.smoothingFactor * this.smoothedPoint.y + (1 - this.smoothingFactor) * rawPoint.y; } return this.smoothedPoint; } else { if (now - this.lastUpdateTime > this.timeout) this.smoothedPoint = null; return this.smoothedPoint; } }
    reset() { this.smoothedPoint = null; this.lastUpdateTime = 0; }
}

export class MotionEngine {
    constructor() {
        this.currentMode = null;
        this.detector = null;
        this.camera = null;
        this.isRunning = false;
        this.loopHandle = null;
        this.videoElement = null;
        this.outputCanvas = null;
        this.canvasCtx = null;
        this.results = {};
        this.eventListeners = new Map();
        
        // [FIX #3] 將預設平滑度因子獨立出來
        this.defaultSmoothing = 0.7;
        this.pointers = [
            // [FIX #4] 為每個指針定義好顏色
            { id: 0, hand: 'left', smoother: new PointSmoother(this.defaultSmoothing), color: 'rgba(0, 255, 255, 1)' }, // Cyan for left
            { id: 1, hand: 'right', smoother: new PointSmoother(this.defaultSmoothing), color: 'rgba(255, 215, 0, 1)' } // Gold for right
        ].map(p => ({ ...p, x: 0, y: 0, isVisible: false, dwell: { element: null, startTime: 0, timer: null } }));
        
        this.pointer = { x: 0, y: 0, isVisible: false, hand: 'right' };
        this.config = {
            dwellActivationThreshold: 1500,
            dwellActivationCooldown: 300,
            pointerHand: 'right'
        };
        this.lastActivationTime = 0;
    }
    
    async initialize() {
        if (this.camera) return;
        this._createEngineElements();
        
        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (this.detector && this.videoElement.readyState === 4) {
                    await this.detector.send({ image: this.videoElement });
                }
            },
            width: 1280,
            height: 720
        });

        await this.camera.start();
        this.isRunning = true;
        this._gameLoop();
    }
    
    // [FIX #1] 新增方法，讓場景可以主動控制指針畫布嘅顯示同隱藏
    showPointer(shouldShow) {
        if (this.outputCanvas) {
            this.outputCanvas.style.display = shouldShow ? 'block' : 'none';
        }
    }

    // [FIX #3] 新增方法，讓場景可以獨立設置平滑度
    setSmoothing(factor) {
        console.log(`[MotionEngine] Setting smoothing factor to ${factor}`);
        this.pointers.forEach(p => p.smoother.setFactor(factor));
    }
    
    // [FIX #3] 新增方法，用於場景銷毀時重置平滑度
    resetSmoothingToDefault() {
        this.setSmoothing(this.defaultSmoothing);
    }

    setPointerHand(hand = 'right') {
        this.config.pointerHand = (hand === 'left' || hand === 'right') ? hand : 'right';
    }
    
    async setMode(newMode) {
        if (this.currentMode === newMode) return;
        console.log(`[MotionEngine] Switching mode from '${this.currentMode}' to '${newMode}'`);

        this.pointers.forEach(p => p.smoother.reset());

        if (this.detector) {
            await this.detector.close();
            this.detector = null;
        }
        
        this.results = {};
        this.currentMode = null;

        if (newMode === null || newMode === 'none') {
            this.emit('mode-changed', null);
            return;
        }

        try {
            const options = { locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/${newMode}/${file}` };
            let ModelClass, modelOptions;

            switch (newMode) {
                case 'hands':
                    ModelClass = window.Hands;
                    modelOptions = { maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 };
                    break;
                case 'pose':
                    ModelClass = window.Pose;
                    modelOptions = { modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 };
                    break;
                case 'holistic':
                    ModelClass = window.Holistic;
                    modelOptions = { modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.7 };
                    break;
                default:
                    throw new Error(`Unsupported mode: ${newMode}`);
            }

            this.detector = new ModelClass(options);
            this.detector.setOptions(modelOptions);
            this.detector.onResults(results => this._onResults(results));
            
            this.currentMode = newMode;
            console.log(`[MotionEngine] Mode '${newMode}' is set and ready.`);
            this.emit('mode-changed', newMode);

        } catch (error) {
            console.error(`[MotionEngine] Failed to set mode ${newMode}:`, error);
            this.currentMode = null;
        }
    }
    
    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        const listeners = this.eventListeners.get(eventName);
        listeners.push(callback);
        
        return () => {
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        };
    }
    
    emit(eventName, data) {
        if (this.eventListeners.has(eventName)) {
            [...this.eventListeners.get(eventName)].forEach(callback => callback(data));
        }
    }

    _createEngineElements() {
        this.videoElement = document.createElement('video');
        this.videoElement.style.cssText = 'position:fixed; top:-1px; left:-1px; width:1px; height:1px;';
        document.body.appendChild(this.videoElement);
        
        this.outputCanvas = document.createElement('canvas');
        Object.assign(this.outputCanvas.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh', zIndex: '9999',
            pointerEvents: 'none', transform: 'scaleX(-1)', display: 'none'
        });
        document.body.appendChild(this.outputCanvas);

        this.canvasCtx = this.outputCanvas.getContext('2d');
        
        const resizeCanvas = () => {
            this.outputCanvas.width = window.innerWidth;
            this.outputCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    }
    
    _onResults(results) {
        this.results = results;
        this._updatePointers(results);
        this.emit('results-updated', results);
    }
    
    _updatePointers(results) {
        const handData = this.getHandsData(results);
        this.pointers.forEach(p => {
            const rawPoint = handData[p.hand];
            const smoothedPoint = p.smoother.update(rawPoint);
            p.isVisible = !!smoothedPoint;
            if (p.isVisible) {
                p.x = smoothedPoint.x;
                p.y = smoothedPoint.y;
            }
        });

        const primaryHand = this.config.pointerHand;
        const secondaryHand = primaryHand === 'right' ? 'left' : 'right';
        const activePointer = this.pointers.find(p => p.isVisible && p.hand === primaryHand) || this.pointers.find(p => p.isVisible && p.hand === secondaryHand);
        
        if (activePointer) {
            this.pointer.x = (1 - activePointer.x) * window.innerWidth;
            this.pointer.y = activePointer.y * window.innerHeight;
            this.pointer.isVisible = true;
            this.pointer.hand = activePointer.hand;
        } else {
            this.pointer.isVisible = false;
        }
    }
    
    getHandsData(results) {
        let hands = { left: null, right: null };
        if (this.currentMode === 'hands' && results.multiHandLandmarks && results.multiHandedness) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                if(results.multiHandedness[i]) {
                    const hand = results.multiHandedness[i].label.toLowerCase();
                    // [FIX #1] 使用食指指尖(8)作為更穩定嘅指針點
                    const target = results.multiHandLandmarks[i][8];
                    if (target) hands[hand] = { x: target.x, y: target.y };
                }
            }
        } else if (this.currentMode === 'holistic') {
            // [FIX #1] 使用食指指尖(8)
            if (results.leftHandLandmarks) hands.left = { x: results.leftHandLandmarks[8].x, y: results.leftHandLandmarks[8].y };
            if (results.rightHandLandmarks) hands.right = { x: results.rightHandLandmarks[8].x, y: results.rightHandLandmarks[8].y };
        } else if (this.currentMode === 'pose' && results.poseLandmarks) {
            // [FIX #1] 無論如何都嘗試從 pose 數據計算手掌中心，產生模擬指針
            hands.left = window.getPalmCenterFromPose(results.poseLandmarks, 'left');
            hands.right = window.getPalmCenterFromPose(results.poseLandmarks, 'right');
        }
        return hands;
    }
    
    _updateHoverAndActivation() {
        const now = performance.now();
        if (now - this.lastActivationTime < this.config.dwellActivationCooldown) {
            this.pointers.forEach(p => this._clearDwell(p));
            return;
        }

        const activatableElements = document.querySelectorAll('[data-motion-activatable]');
        const allHoveredElements = new Set();

        this.pointers.forEach(p => {
            if (!p.isVisible) {
                this._clearDwell(p);
                return;
            }
            
            const screenX = (1 - p.x) * window.innerWidth;
            const screenY = p.y * window.innerHeight;
            
            let currentlyHovered = null;
            for (const el of activatableElements) {
                const rect = el.getBoundingClientRect();
                if (screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom) {
                    currentlyHovered = el;
                    break;
                }
            }

            if (p.dwell.element !== currentlyHovered) {
                this._clearDwell(p);
                if (currentlyHovered) {
                    p.dwell.element = currentlyHovered;
                    p.dwell.startTime = now;
                    p.dwell.timer = setTimeout(() => {
                        if (p.dwell.element) {
                            this.lastActivationTime = performance.now();
                            // 觸發原生 click 事件，更可靠
                            p.dwell.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                            this._clearDwell(p);
                        }
                    }, this.config.dwellActivationThreshold);
                }
            }

            if (p.dwell.element) {
                allHoveredElements.add(p.dwell.element);
            }
        });

        document.querySelectorAll('.motion-hover').forEach(el => {
            if (!allHoveredElements.has(el)) el.classList.remove('motion-hover');
        });
        allHoveredElements.forEach(el => el.classList.add('motion-hover'));
    }

    _clearDwell(pointer) {
        if (pointer.dwell.timer) clearTimeout(pointer.dwell.timer);
        if (pointer.dwell.element) pointer.dwell.element.classList.remove('motion-hover');
        pointer.dwell = { element: null, startTime: 0, timer: null };
    }
    
    _drawPointer() {
        const ctx = this.canvasCtx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        this.pointers.forEach(p => {
            if (!p.isVisible) return;
            
            const drawX = p.x * ctx.canvas.width;
            const drawY = p.y * ctx.canvas.height;
            const color = p.color; // [FIX #4] 使用指針自帶嘅顏色
            
            // 繪製倒數圈
            if (p.dwell.element) {
                const progress = Math.min((performance.now() - p.dwell.startTime) / this.config.dwellActivationThreshold, 1);
                ctx.strokeStyle = color; 
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(drawX, drawY, 20, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
                ctx.stroke();
            }
            
            // 繪製中心點
            ctx.fillStyle = color.replace('1)', '0.7)');
            ctx.beginPath();
            ctx.arc(drawX, drawY, 15, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    _gameLoop() {
        if (!this.isRunning) return;
        this._updateHoverAndActivation();
        
        // [FIX #1] 只有喺 outputCanvas 可見時先繪製指針
        if (this.outputCanvas.style.display !== 'none') {
            this._drawPointer();
        }
        
        this.loopHandle = requestAnimationFrame(() => this._gameLoop());
    }
}