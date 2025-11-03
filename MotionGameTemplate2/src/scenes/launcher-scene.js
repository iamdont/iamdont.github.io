// src/scenes/launcher-scene.js
export class LauncherScene {
    constructor() {}

    render() {
        return `
            <div class="launcher-scene">
                <h1>Motion Games Platform</h1>
                <div class="launcher-grid">
                    <!-- === Group: Games === -->
                    <a data-scene="games/cup-knock" class="card" data-motion-activatable><div><h2>撞杯子</h2></div><div class="tags"><span class="tag">🖐️ Hands</span></div></a>
                    <a data-scene="games/pose-wall" class="card" data-motion-activatable><div><h2>姿勢之牆</h2></div><div class="tags"><span class="tag">🚶 Pose</span></div></a>
                    <a data-scene="games/magic-guardian" class="card" data-motion-activatable><div><h2>魔法守護者</h2></div><div class="tags"><span class="tag">🧍 Holistic</span></div></a>
                    <a data-scene="games/joint-painter" class="card" data-motion-activatable><div><h2>關節繪畫</h2></div><div class="tags"><span class="tag">🚶 Pose</span></div></a>
                    <a data-scene="games/path-of-balance" class="card" data-motion-activatable><div><h2>平衡之道</h2></div><div class="tags"><span class="tag">🚶 Pose</span></div></a>
                    <a data-scene="games/motion-beat" class="card" data-motion-activatable><div><h2>動感節拍</h2></div><div class="tags"><span class="tag">🚶 Pose</span></div></a>
                    <a data-scene="games/energy-flow" class="card" data-motion-activatable><div><h2>能量引導</h2></div><div class="tags"><span class="tag">🚶 Pose</span></div></a>

                    <!-- === Group: Prototypes (Completed) === -->
                    <a data-scene="prototypes/shape-deformer" class="card" data-motion-activatable style="border-color: #4CAF50;">
                        <div><h2 style="color: #4CAF50;">[P] 形狀變形</h2></div><div class="tags"><span class="tag">🤏 Pinch</span></div></a>
                    <a data-scene="prototypes/throw-game" class="card" data-motion-activatable style="border-color: #e91e63;">
                        <div><h2 style="color: #e91e63;">[P] 2D 投擲</h2></div><div class="tags"><span class="tag">👋 Throw</span></div></a>
                    <a data-scene="prototypes/carry-game" class="card" data-motion-activatable style="border-color: #9c27b0;">
                        <div><h2 style="color: #9c27b0;">[P] 雙手搬運</h2></div><div class="tags"><span class="tag">🙌 Carry</span></div></a>
                    <a data-scene="prototypes/ribbon-painter" class="card" data-motion-activatable style="border-color: #00bcd4;">
                        <div><h2 style="color: #00bcd4;">[P] 能量絲帶</h2></div><div class="tags"><span class="tag">🎨 Creative</span></div></a>
                        
                    <!-- === Group: Prototypes (New) === -->
                    <a data-scene="prototypes/throw-3d" class="card" data-motion-activatable style="border-color: #FF9800;">
                        <div><h2 style="color: #FF9800;">[P] 3D 投擲</h2></div>
                        <div class="tags"><span class="tag">⚾ 3D</span><span class="tag">🧍 Holistic</span></div>
                    </a>
                    <a data-scene="prototypes/scale-rotate" class="card" data-motion-activatable style="border-color: #FF9800;">
                        <div><h2 style="color: #FF9800;">[P] 雙手縮放旋轉</h2></div>
                        <div class="tags"><span class="tag">🔄 Scale/Rotate</span></div>
                    </a>
                    <a data-scene="prototypes/marionette" class="card" data-motion-activatable style="border-color: #FF9800;">
                        <div><h2 style="color: #FF9800;">[P] 虛擬提線木偶</h2></div>
                        <div class="tags"><span class="tag">🕴️ Rigging</span></div>
                    </a>
                    
                    <!-- === Group: Core === -->
                    <a data-scene="test" class="card" data-motion-activatable><div><h2>調試儀表板</h2></div><div class="tags"><span class="tag">⚙️ DEV</span></div></a>
                </div>
            </div>
        `;
    }

    init() {
        window.motionEngine.setMode('holistic');
        window.motionEngine.outputCanvas.style.display = 'block';
        this.cards = document.querySelectorAll('.card[data-scene]');
        this.cards.forEach(card => card.addEventListener('click', this.onCardClick));
    }

    onCardClick(event) {
        event.preventDefault();
        const sceneName = event.currentTarget.dataset.scene;
        if (sceneName) {
            window.sceneManager.loadScene(sceneName);
        }
    }

    destroy() {
        this.cards.forEach(card => {
            card.removeEventListener('click', this.onCardClick);
        });
    }
}