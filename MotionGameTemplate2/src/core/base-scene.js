// src/core/base-scene.js
// 添加 Canvas 自動適配功能

export class BaseScene {
    constructor(params = {}) {
        this.params = params;
        this.container = null;
        this.loopHandle = null;
        
        this.motionEngine = window.motionEngine;
        this.unsubscribeMotionResults = null;
        this.latestResults = null;
        
        this.sceneManager = window.sceneManager;
        this.eventHandlers = new Map();

        this.viewport = window.viewport;
        this.DESIGN_WIDTH = this.viewport.designWidth;
        this.DESIGN_HEIGHT = this.viewport.designHeight;
    }

    async __internal_mount(container) {
        this.container = container;
        this.container.innerHTML = this.renderHTML();
        
        this._bindBackButton();

        if (typeof this.onInit === 'function') {
            await this.onInit();
        }

        this.gameLoop();
        console.log(`[${this.constructor.name}] Mounted and Initialized.`);
    }

    destroy() {
        console.log(`[${this.constructor.name}] Starting destruction...`);
        
        if (this.loopHandle) {
            cancelAnimationFrame(this.loopHandle);
            this.loopHandle = null;
        }

        if (this.unsubscribeMotionResults) {
            this.unsubscribeMotionResults();
            this.unsubscribeMotionResults = null;
        }

        this._unbindAllManagedEvents();
        
        if (typeof this.onDestroy === 'function') {
            this.onDestroy();
        }
        
        if (this.container) {
            this.container.innerHTML = '';
            this.container = null;
        }
        
        this.motionEngine.resetSmoothingToDefault();
        this.motionEngine.setMode('none'); 
        this.motionEngine.showPointer(false);

        console.log(`[${this.constructor.name}] Destroyed successfully.`);
    }

    gameLoop() {
        const now = performance.now();
        if (typeof this.onUpdate === 'function') {
            this.onUpdate(now);
        }
        if (typeof this.onDraw === 'function') {
            this.onDraw(now);
        }
        this.loopHandle = requestAnimationFrame(() => this.gameLoop());
    }

    renderHTML() { throw new Error(`[${this.constructor.name}] Must implement renderHTML()`); }
    onInit() { /* Override in child class */ }
    onUpdate(timestamp) { /* Override in child class */ }
    onDraw(timestamp) { /* Override in child class */ }
    onDestroy() { /* Override in child class */ }

    addManagedEventListener(element, eventName, handler) {
        element.addEventListener(eventName, handler);
        if (!this.eventHandlers.has(element)) {
            this.eventHandlers.set(element, []);
        }
        this.eventHandlers.get(element).push({ eventName, handler });
    }

    listenToMotionResults() {
        this.unsubscribeMotionResults = this.motionEngine.on('results-updated', (results) => {
            this.latestResults = results;
            if (typeof this.onResults === 'function') {
                this.onResults(results);
            }
        });
    }

    _bindBackButton() {
        const backButton = this.container.querySelector('.back-button');
        if (backButton) {
            const sceneChanger = backButton.dataset.sceneChanger || 'scenes/launcher';
            const handler = () => this.sceneManager.loadScene(sceneChanger);
            this.addManagedEventListener(backButton, 'click', handler);
        }
    }

    _unbindAllManagedEvents() {
        for (const [element, handlers] of this.eventHandlers.entries()) {
            handlers.forEach(({ eventName, handler }) => {
                element.removeEventListener(eventName, handler);
            });
        }
        this.eventHandlers.clear();
        console.log(`[${this.constructor.name}] All managed event listeners removed.`);
    }

    /**
     * 設置並自動適配 Canvas
     * @param {string} canvasId - 你嘅 canvas 元素嘅 ID
     * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}}
     */
    setupCanvas(canvasId) {
        const canvas = this.container.querySelector(`#${canvasId}`);
        if (!canvas) {
            throw new Error(`Canvas with id "${canvasId}" not found in scene.`);
        }

        this.viewport.applyTo(canvas);
        
        canvas.width = this.DESIGN_WIDTH;
        canvas.height = this.DESIGN_HEIGHT;

        const ctx = canvas.getContext('2d');
        
        // 處理 viewport 更新事件，重新應用樣式
        const resizeHandler = () => this.viewport.applyTo(canvas);
        this.addManagedEventListener(window, 'viewport-updated', resizeHandler);
        
        console.log(`[${this.constructor.name}] Canvas "${canvasId}" setup with design resolution ${canvas.width}x${canvas.height}`);
        
        return { canvas, ctx };
    }
}