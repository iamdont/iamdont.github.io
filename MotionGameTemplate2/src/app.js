import { MotionEngine } from './motion-engine.js';
import { SceneManager } from './scene-manager.js';

class App {
    constructor() {
        this.motionEngine = new MotionEngine();
        this.sceneManager = new SceneManager('app-container');
    }

    async init() {
        console.log("Cerberus Platform: Initializing...");
        window.motionEngine = this.motionEngine;
        window.sceneManager = this.sceneManager;
        
        try {
            await this.motionEngine.initialize();
            console.log("Motion Engine is online.");
            this.sceneManager.loadScene('launcher');
        } catch (error) {
            console.error("Failed to initialize the app:", error);
            document.getElementById('app-container').innerHTML = `
                <div style="color: white; text-align: center; padding: 50px;">
                    <h1>初始化失敗</h1><p>無法啟動動作感應引擎。請確保您已授權瀏覽器使用相機，並刷新頁面重試。</p>
                    <p><em>錯誤詳情: ${error.message}</em></p>
                </div>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});