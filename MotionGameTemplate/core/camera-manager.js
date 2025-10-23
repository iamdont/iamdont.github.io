// In camera-manager.js
class CameraManager {
    constructor(videoElement, options = {}) {
        this.video = videoElement;
        this.stream = null;
        this.isReady = false;
        
        this.config = {
            width: 1280,
            height: 720,
            facingMode: 'user',
            frameRate: 30,
            ...options
        };
    }
    
    async initialize() {
        try {
            // 請求相機權限
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: this.config.width },
                    height: { ideal: this.config.height },
                    facingMode: this.config.facingMode,
                    frameRate: { ideal: this.config.frameRate }
                }
            });
            
            this.video.srcObject = this.stream;
            
            // 等待視頻 metadata 載入
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.isReady = true;
                    resolve();
                };
            });
        } catch (error) {
            console.error('Camera initialization failed:', error);
            throw new Error(`無法存取相機: ${error.message}`);
        }
    }
    
    switchCamera() {
        this.config.facingMode = 
            this.config.facingMode === 'user' ? 'environment' : 'user';
        this.restart();
    }
    
    async restart() {
        this.stop();
        await this.initialize();
    }
    
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}