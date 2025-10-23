// In motion-detector.js
class MotionDetector {
    constructor(mode = 'hands') {
        this.mode = mode; // 'hands', 'pose', 'holistic'
        this.detector = null;
        this.isProcessing = false;
        this.callbacks = new Map();
        
        // 性能優化選項
        this.config = {
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            modelComplexity: 1,
            smoothLandmarks: true,
            maxNumHands: 2
        };
    }
    
    async initialize() {
        // 動態載入 MediaPipe
        await this.loadMediaPipe();
        
        switch(this.mode) {
            case 'hands':
                this.detector = new Hands({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                    }
                });
                break;
            case 'pose':
                this.detector = new Pose({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                    }
                });
                break;
            case 'holistic':
                this.detector = new Holistic({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
                    }
                });
                break;
        }
        
        this.detector.setOptions(this.config);
        
        // 設置結果回調
        this.detector.onResults((results) => {
            this.processResults(results);
        });
    }
    
    async loadMediaPipe() {
        // 動態載入 MediaPipe scripts
        const scripts = [
            'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
            'https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js',
            'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
            `https://cdn.jsdelivr.net/npm/@mediapipe/${this.mode}/${this.mode}.js`
        ];
        
        for (const src of scripts) {
            await this.loadScript(src);
        }
    }
    
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    processResults(results) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        // 轉換為統一格式
        const motionData = this.normalizeResults(results);
        
        // 觸發所有註冊的回調
        this.emit('motion', motionData);
        
        // 手勢識別
        if (this.mode === 'hands' && results.multiHandLandmarks) {
            const gestures = this.recognizeGestures(results.multiHandLandmarks);
            if (gestures.length > 0) {
                this.emit('gesture', gestures);
            }
        }
        
        this.isProcessing = false;
    }
    
    normalizeResults(results) {
        const normalized = {
            timestamp: Date.now(),
            mode: this.mode,
            landmarks: [],
            worldLandmarks: [],
            confidence: 0
        };
        
        switch(this.mode) {
            case 'hands':
                if (results.multiHandLandmarks) {
                    normalized.landmarks = results.multiHandLandmarks;
                    normalized.worldLandmarks = results.multiHandWorldLandmarks;
                    normalized.handedness = results.multiHandedness;
                }
                break;
            case 'pose':
                if (results.poseLandmarks) {
                    normalized.landmarks = [results.poseLandmarks];
                    normalized.worldLandmarks = [results.poseWorldLandmarks];
                }
                break;
        }
        
        return normalized;
    }
    
    recognizeGestures(handLandmarks) {
        const gestures = [];
        
        for (const landmarks of handLandmarks) {
            // 簡單手勢識別邏輯
            if (this.isPointingGesture(landmarks)) {
                gestures.push({ type: 'pointing', landmarks });
            }
            if (this.isSwipeGesture(landmarks)) {
                gestures.push({ type: 'swipe', landmarks });
            }
            if (this.isGrabGesture(landmarks)) {
                gestures.push({ type: 'grab', landmarks });
            }
        }
        
        return gestures;
    }
    
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }
    
    emit(event, data) {
        const callbacks = this.callbacks.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }
}