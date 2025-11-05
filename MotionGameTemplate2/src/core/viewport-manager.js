// src/core/viewport-manager.js
// 新增：動態修改根字體大小以實現 rem 縮放

class ViewportManager {
    constructor(designWidth, designHeight) {
        this.designWidth = designWidth;
        this.designHeight = designHeight;
        this.designAspectRatio = designWidth / designHeight;
        
        // 設定一個基礎字體大小，所有 rem 計算都基於此
        this.baseFontSize = 16; 

        this.screenWidth = 0;
        this.screenHeight = 0;
        
        this.viewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            scale: 1,
        };

        window.addEventListener('resize', () => this.update());
        this.update();
    }

    update() {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        const screenAspectRatio = this.screenWidth / this.screenHeight;

        if (screenAspectRatio > this.designAspectRatio) {
            this.viewport.height = this.screenHeight;
            this.viewport.scale = this.screenHeight / this.designHeight;
            this.viewport.width = this.designWidth * this.viewport.scale;
            this.viewport.x = (this.screenWidth - this.viewport.width) / 2;
            this.viewport.y = 0;
        } else {
            this.viewport.width = this.screenWidth;
            this.viewport.scale = this.screenWidth / this.designWidth;
            this.viewport.height = this.designHeight * this.viewport.scale;
            this.viewport.x = 0;
            this.viewport.y = (this.screenHeight - this.viewport.height) / 2;
        }

        // --- 核心改動 ---
        // 根據 viewport 嘅縮放比例，動態計算 rem 嘅根字體大小
        const newRootFontSize = this.baseFontSize * this.viewport.scale;
        document.documentElement.style.fontSize = `${newRootFontSize}px`;
        // ------------------

        console.log(`[ViewportManager] Updated: root font size set to ${newRootFontSize.toFixed(2)}px`);
        
        window.dispatchEvent(new Event('viewport-updated'));
    }

    applyTo(element) {
        if (!element) return;
        element.style.position = 'absolute';
        element.style.left = `${this.viewport.x}px`;
        element.style.top = `${this.viewport.y}px`;
        element.style.width = `${this.viewport.width}px`;
        element.style.height = `${this.viewport.height}px`;
    }

    motionToWorld(x, y) {
        return {
            x: x * this.designWidth,
            y: y * this.designHeight,
        }
    }
}

export const viewportManager = new ViewportManager(1280, 720);