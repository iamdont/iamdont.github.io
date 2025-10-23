// In motion-sdk.js
class MotionSDK {
    constructor(options = {}) {
        this.config = {
            mode: 'hands',
            renderDebug: true,
            autoStart: true,
            ...options
        };
        
        this.cameraManager = null;
        this.detector = null;
        this.debugCanvas = null;
        this.isInitialized = false;
        
        // 事件系統
        this.eventHandlers = new Map();
        
        // 動作歷史（用於手勢識別）
        this.motionHistory = [];
        this.maxHistoryLength = 30;
    }
    
    async init(videoElementId = 'camera-feed', debugCanvasId = 'debug-canvas') {
        try {
            // 設置 UI 元素
            const video = document.getElementById(videoElementId);
            this.debugCanvas = document.getElementById(debugCanvasId);
            
            // 初始化相機
            this.cameraManager = new CameraManager(video);
            await this.cameraManager.initialize();
            
            // 初始化動作偵測
            this.detector = new MotionDetector(this.config.mode);
            await this.detector.initialize();
            
            // 連接相機與偵測器
            this.connectCameraToDetector(video);
            
            // 設置事件轉發
            this.setupEventForwarding();
            
            this.isInitialized = true;
            this.emit('ready');
            
        } catch (error) {
            console.error('MotionSDK initialization failed:', error);
            this.emit('error', error);
            throw error;
        }
    }
    
    connectCameraToDetector(video) {
        const camera = new Camera(video, {
            onFrame: async () => {
                if (this.detector && this.detector.detector) {
                    await this.detector.detector.send({ image: video });
                }
            },
            width: 1280,
            height: 720
        });
        
        if (this.config.autoStart) {
            camera.start();
        }
    }
    
    setupEventForwarding() {
        // 轉發動作數據
        this.detector.on('motion', (data) => {
            // 更新歷史
            this.updateMotionHistory(data);
            
            // 座標映射
            const mappedData = this.mapToScreenCoordinates(data);
            
            // 渲染調試視覺
            if (this.config.renderDebug && this.debugCanvas) {
                this.renderDebugVisualization(mappedData);
            }
            
            // 觸發事件
            this.emit('motion', mappedData);
        });
        
        // 轉發手勢
        this.detector.on('gesture', (gestures) => {
            this.emit('gesture', gestures);
        });
    }
    
    mapToScreenCoordinates(motionData) {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        const mapped = { ...motionData };
        
        if (mapped.landmarks) {
            mapped.screenLandmarks = mapped.landmarks.map(landmarkSet => 
                landmarkSet.map(point => ({
                    x: point.x * screenWidth,
                    y: point.y * screenHeight,
                    z: point.z,
                    visibility: point.visibility || 1
                }))
            );
        }
        
        return mapped;
    }
    
    renderDebugVisualization(data) {
        const ctx = this.debugCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
        
        if (!data.screenLandmarks) return;
        
        // 繪製關節點和連線
        ctx.strokeStyle = '#00ff00';
        ctx.fillStyle = '#ff0000';
        ctx.lineWidth = 2;
        
        for (const landmarks of data.screenLandmarks) {
            // 繪製點
            for (const point of landmarks) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // 繪製連線（手部）
            if (this.config.mode === 'hands') {
                this.drawHandConnections(ctx, landmarks);
            }
        }
    }
    
    // 公共 API 方法
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    
    emit(event, data) {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.forEach(handler => handler(data));
    }
    
    switchMode(newMode) {
        this.config.mode = newMode;
        this.restart();
    }
    
    async restart() {
        // 停止當前檢測
        if (this.detector) {
            // 清理資源
        }
        
        // 重新初始化
        await this.init();
    }
}

// 全局單例
window.MotionSDK = MotionSDK;