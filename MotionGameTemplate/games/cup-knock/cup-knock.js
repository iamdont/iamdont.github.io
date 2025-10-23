// In games/cup-knock/cup-knock.js
class CupKnockGame extends MotionGame {
    constructor(containerId) {
        super(containerId, {
            motionMode: 'hands',
            physics: true,
            debug: true
        });
        
        this.cups = [];
        this.knockedCups = 0;
    }
    
    setupGameObjects() {
        // 創建 5 個杯子
        for (let i = 0; i < 5; i++) {
            const cup = new Cup(
                200 + i * 150,  // x position
                400,            // y position
                this.world
            );
            this.cups.push(cup);
            this.gameObjects.push(cup);
        }
    }
    
    onMotionUpdate(motionData) {
        super.onMotionUpdate(motionData);
        
        // 額外的碰撞檢測邏輯
        if (motionData.screenLandmarks) {
            for (const landmarks of motionData.screenLandmarks) {
                const handVelocity = this.calculateHandVelocity(landmarks);
                
                // 如果手部移動速度夠快
                if (handVelocity > 10) {
                    this.applyForceNearHand(landmarks[9], handVelocity);
                }
            }
        }
    }
    
    calculateHandVelocity(landmarks) {
        // 計算手部移動速度
        // (簡化版本，實際需要比較前後幀)
        return 15; // placeholder
    }
    
    applyForceNearHand(handPosition, velocity) {
        for (const cup of this.cups) {
            const distance = cup.distanceTo(handPosition);
            
            if (distance < 100 && !cup.isKnocked) {
                // 計算力的方向
                const forceDirection = {
                    x: (cup.x - handPosition.x) * 0.01,
                    y: -0.01
                };
                
                // 應用物理力量
                cup.knock(forceDirection, velocity);
                
                // 更新分數
                this.state.score += 100;
                this.knockedCups++;
                
                // 播放音效
                this.playSound('knock');
                
                // 檢查勝利條件
                if (this.knockedCups === this.cups.length) {
                    this.onLevelComplete();
                }
            }
        }
    }
    
    onLevelComplete() {
        console.log('Level Complete!');
        // 顯示勝利畫面
        setTimeout(() => {
            this.resetLevel();
        }, 3000);
    }
}

// Cup 類別
class Cup {
    constructor(x, y, world) {
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 80;
        this.isKnocked = false;
        
        // Matter.js 物理體
        this.body = Matter.Bodies.rectangle(x, y, this.width, this.height, {
            density: 0.001,
            friction: 0.1,
            restitution: 0.6
        });
        
        Matter.World.add(world, this.body);
    }
    
    knock(force, velocity) {
        if (this.isKnocked) return;
        
        this.isKnocked = true;
        Matter.Body.applyForce(this.body, this.body.position, {
            x: force.x * velocity,
            y: force.y * velocity
        });
    }
    
    update() {
        // 同步 Matter.js 位置
        this.x = this.body.position.x;
        this.y = this.body.position.y;
        this.rotation = this.body.angle;
    }
    
    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // 繪製杯子
        ctx.fillStyle = this.isKnocked ? '#888' : '#4287f5';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        ctx.restore();
    }
    
    distanceTo(point) {
        const dx = this.x - point.x;
        const dy = this.y - point.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}