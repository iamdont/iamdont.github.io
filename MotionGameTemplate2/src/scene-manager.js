// src/scene-manager.js

export class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`SceneManager: Container with id "${containerId}" not found.`);
        this.currentScene = null;
    }

    async loadScene(sceneName, params = {}) {
        console.log(`[SceneManager] Request to load scene: "${sceneName}"`);
        if (this.currentScene && typeof this.currentScene.destroy === 'function') {
            await this.currentScene.destroy();
        }
        this.currentScene = null;
        this.container.innerHTML = `<div style="color:white;text-align:center;padding-top:100px;font-size:2em;">Loading ${sceneName}...</div>`;

        try {
            let modulePath;

            // 使用絕對路徑，由網站根目錄 (/) 開始
            if (sceneName.includes('/')) {
                // e.g., 'games/cup-knock' -> '/src/games/cup-knock-scene.js'
                modulePath = `/src/${sceneName}-scene.js`;
            } else {
                // e.g., 'launcher' -> '/src/scenes/launcher-scene.js'
                modulePath = `/src/scenes/${sceneName}-scene.js`;
            }
            
            console.log(`[SceneManager] Using ABSOLUTE path to import module: "${modulePath}"`);
            const sceneModule = await import(modulePath);
            
            const SceneClass = Object.values(sceneModule)[0];
            if (!SceneClass) throw new Error(`No class exported from ${modulePath}`);

            this.currentScene = new SceneClass(params);
            const sceneHtml = this.currentScene.render();
            this.container.innerHTML = sceneHtml;

            if (typeof this.currentScene.init === 'function') {
                await this.currentScene.init();
            }
            console.log(`[SceneManager] Scene loaded successfully: "${sceneName}"`);

        } catch (error) {
            console.error(`[SceneManager] FATAL ERROR loading scene "${sceneName}":`, error);
            this.container.innerHTML = `<div style="color:red;text-align:center;padding:50px;">
                <h2>Error loading scene: ${sceneName}</h2>
                <p><strong>Please check the browser console for the exact error.</strong></p>
            </div>`;
        }
    }
}