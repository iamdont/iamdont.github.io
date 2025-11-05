// src/scene-manager.js
export class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`SceneManager: Container with id "${containerId}" not found.`);
        }
        this.currentScene = null;
        this.currentSceneName = null;
        this.isLoading = false; // 防止重複加載
    }

    async loadScene(sceneName, params = {}) {
        if (this.isLoading || this.currentSceneName === sceneName) {
            console.warn(`[SceneManager] Load request for "${sceneName}" ignored. (isLoading: ${this.isLoading}, isCurrent: ${this.currentSceneName === sceneName})`);
            return;
        }
        
        this.isLoading = true;
        console.log(`[SceneManager] Request to load scene: "${sceneName}"`);
        
        if (this.currentScene && typeof this.currentScene.destroy === 'function') {
            console.log(`[SceneManager] Destroying previous scene: "${this.currentSceneName}"...`);
            this.currentScene.destroy(); // 使用同步銷毀，確保資源在加載新場景前被釋放
        }
        
        this.currentScene = null;
        this.currentSceneName = sceneName;
        this.container.innerHTML = `<div style="color:white;text-align:center;padding-top:100px;font-size:2em;">Loading ${sceneName}...</div>`;

        try {
            // 所有 scene class file 都應以 "-scene.js" 結尾
            const modulePath = `/src/${sceneName}-scene.js`;
            
            console.log(`[SceneManager] Importing module from: "${modulePath}"`);
            const sceneModule = await import(modulePath);
            
            // 假設每個 scene file 只 export 一個 class
            const SceneClass = Object.values(sceneModule)[0];
            if (!SceneClass) {
                throw new Error(`No class exported from ${modulePath}`);
            }

            this.currentScene = new SceneClass(params);
            
            // 使用新嘅內部 mount 方法
            if (typeof this.currentScene.__internal_mount === 'function') {
                await this.currentScene.__internal_mount(this.container);
            } else {
                throw new Error(`Scene "${sceneName}" does not inherit from BaseScene or is improperly constructed.`);
            }

            console.log(`[SceneManager] Scene loaded successfully: "${sceneName}"`);

        } catch (error) {
            console.error(`[SceneManager] FATAL ERROR loading scene "${sceneName}":`, error);
            this.container.innerHTML = `<div style="color:red;text-align:center;padding:50px;">
                <h2>Error loading scene: ${sceneName}</h2>
                <p><strong>Please check the browser console for the exact error.</strong></p>
                <p>${error.message}</p>
            </div>`;
            this.currentScene = null;
            this.currentSceneName = null;
        } finally {
            this.isLoading = false;
        }
    }
}