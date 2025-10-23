// In game-base.js
class MotionGame {
    constructor(containerId, gameConfig = {}) {
        this.container = document.getElementById(containerId);
        this.config = {
            width: window.innerWidth,
            height: window.innerHeight,
            physics: true,
            debug: false,
            ...gameConfig
        };
        
        // 遊戲狀態
        this.state = {
            score: 0,
            lives: 3,
            isPaused: false,
            isGameOver: false
        };
        
        // 遊戲物件
        this.gameObjects = [];
        this.interactiveZones = [];
        
        // Motion SDK
        this.motionSDK = null;
        
        // 渲染層
        this.canvas = null;
        this.ctx = null;
        
        // 物理引擎 (Matter.js)
        this.engine = null;
        this.world = null;
        
        this.setupCanvas();
        this.setupPhysics();
    }
    
    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.config.width;
        this.canvas.height = this.config.height;
        this.canvas.className = 'game-canvas';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }
    
    setupPhysics() {
        if (!this.config.physics) return;
        
        // Matter.js 初始化
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;
        
        // 設置重力
        this.engine.world.gravity.y = 1;
        
        // 添加地面
        const ground = Matter.Bodies.rectangle(
            this.config.width / 2,
            this.config.height - 20,
            this.config.width,
            40,
            { isStatic: true }
        );
        Matter.World.add(this.world, ground);
    }
    
    async initialize() {
        // 初始化 Motion SDK
        this.motionSDK = new MotionSDK({
            mode: this.config.motionMode || 'hands',
            renderDebug: this.config.debug
        });
        
        await this.motionSDK.init();
        
        // 設置動作事件監聽
        this.setupMotionControls();
        
        // 初始化遊戲物件
        this.setupGameObjects();
        
        // 開始遊戲循環
        this.startGameLoop();
    }
    
    setupMotionControls() {
        // 監聽動作
        this.motionSDK.on('motion', (data) => {
            this.onMotionUpdate(data);
        });
        
        // 監聽手勢
        this.motionSDK.on('gesture', (gestures) => {
            this.onGestureDetected(gestures);
        });
    }
    
    onMotionUpdate(motionData) {
        // 檢查碰撞
        if (motionData.screenLandmarks) {
            for (const landmarks of motionData.screenLandmarks) {
                // 使用手指尖端 (index 8) 或手掌中心 (index 9)
                const interactionPoint = landmarks[8] || landmarks[9];
                
                if (interactionPoint) {
                    this.checkInteraction(interactionPoint);
                }
            }
        }
    }
    
    checkInteraction(point) {
        // 檢查與遊戲物件的互動
        for (const obj of this.gameObjects) {
            if (obj.checkCollision && obj.checkCollision(point)) {
                this.onObjectHit(obj, point);
            }
        }
    }
    
    onObjectHit(object, point) {
        // 子類實現具體邏輯
        console.log('Hit:', object, point);
    }
    
    onGestureDetected(gestures) {
        // 子類實現手勢響應
        console.log('Gesture:', gestures);
    }
    
    startGameLoop() {
        const loop = () => {
            if (!this.state.isPaused && !this.state.isGameOver) {
                this.update();
                this.render();
            }
            requestAnimationFrame(loop);
        };
        loop();
    }
    
    update() {
        // 更新物理引擎
        if (this.engine) {
            Matter.Engine.update(this.engine, 1000 / 60);
        }
        
        // 更新遊戲物件
        for (const obj of this.gameObjects) {
            if (obj.update) obj.update();
        }
    }
    
    render() {
        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 渲染遊戲物件
        for (const obj of this.gameObjects) {
            if (obj.render) obj.render(this.ctx);
        }
        
        // 渲染 UI
        this.renderUI();
    }
    
    renderUI() {
        // 分數
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Score: ${this.state.score}`, 20, 40);
        this.ctx.fillText(`Lives: ${this.state.lives}`, 20, 80);
    }
    
    // 需要子類實現的方法
    setupGameObjects() {
        throw new Error('setupGameObjects() must be implemented by subclass');
    }
}