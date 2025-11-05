// src/app.js
import { MotionEngine } from './motion-engine.js';
import { SceneManager } from './scene-manager.js';
import { viewportManager } from './core/viewport-manager.js';

class App {
    constructor() {
        window.motionEngine = new MotionEngine();
        window.sceneManager = new SceneManager('app-container');
        window.viewport = viewportManager;
    }

    async init() {
        console.log("Motion Game Platform: Initializing...");
        
        try {
            await window.motionEngine.initialize();
            console.log("Motion Engine is online.");
            
            window.sceneManager.loadScene('scenes/launcher');

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