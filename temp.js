constructor() {
    const initialPointId = Date.now();
    const initialPoint = {
        id: initialPointId,
        hsPos: { u: 0, v: 0 },
        originalHsPos: { u: 0, v: 0 },
        lightness: 0.5,
        alpha: 1.0,
        pos: 0.5,
        order: 1,
    };

    this.state = {
        points: [initialPoint],
        selectedPointIds: new Set([initialPointId]),
        lastSelectedPointId: initialPointId,
        activeDrag: { type: null, element: null, pointId: null },
        transform: { scale: 1, offsetX: 0, offsetY: 0 },
        viewLightness: initialPoint.lightness,
        viewAlpha: initialPoint.alpha,
        colorSpace: 'RGB_CUBE',
        undoStack: [],
        redoStack: [],
        isMouseInCanvas: false,
    };

    this.validPointsCache = null;
    this.clickCount = 0;
    this.lastClickTime = 0;
    this.lastClickTarget = null;

    this.initializeDOM();
    this.updateTabs();
    this.setupCanvases();
    this.setupEventListeners();
}

setupEventListeners() {
    this.elements.tabRgbCube.addEventListener('click', () => this.setColorSpace('RGB_CUBE'));
    this.elements.tabHslCone.addEventListener('click', () => this.setColorSpace('HSL_DI_CONE'));

    const mainContainer = document.querySelector('.w-full.h-\\[400px\\]');
    if (mainContainer) {
        mainContainer.addEventListener('mouseenter', () => { this.state.isMouseInCanvas = true; });
        mainContainer.addEventListener('mouseleave', () => { this.state.isMouseInCanvas = false; });
        
        mainContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deselectAll();
        });
    }

    const resizeObserver = new ResizeObserver(() => this.setupCanvases());
    resizeObserver.observe(document.querySelector('.w-full'));
    
    this.elements.hsNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'hs'));
    this.elements.lightnessNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'lightness'));
    this.elements.alphaNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'alpha'));

    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
}

handleKeyDown(e) {
    if (['0', '1', '2', '3', '4'].includes(e.key)) {
        if (this.state.isMouseInCanvas && this.state.selectedPointIds.size > 0) {
            this.saveState();
            const newOrder = parseInt(e.key, 10);
            this.state.points.forEach(point => {
                if (this.state.selectedPointIds.has(point.id)) {
                    point.order = newOrder;
                }
            });
            this.drawAll();
        }
        return;
    }

    if (e.key === 'Escape') {
        e.preventDefault();
        this.deselectAll();
        return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key === 'z') {
        e.preventDefault();
        this.undo();
        return;
    }

    if (isCtrl && e.key === 'y') {
        e.preventDefault();
        this.redo();
        return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.state.selectedPointIds.size > 0) {
            this.saveState();
            
            this.state.points = this.state.points.filter(point => !this.state.selectedPointIds.has(point.id));
            this.state.selectedPointIds.clear();
            this.state.lastSelectedPointId = null;

            if (this.state.points.length === 0) {
                const initialPointId = Date.now();
                const initialPoint = {
                    id: initialPointId,
                    hsPos: { u: 0, v: 0 },
                    originalHsPos: { u: 0, v: 0 },
                    lightness: 0.5,
                    alpha: 1.0,
                    pos: 0.5,
                    order: 1,
                };
                this.state.points.push(initialPoint);
                this.state.selectedPointIds.add(initialPoint.id);
                this.state.lastSelectedPointId = initialPoint.id;
            }
            this.drawAll();
        }
    }
}

drawHSElements() {
    const canvas = this.elements.interactiveCanvases['hs'];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (this.state.points.length > 1) {
        this.drawConnectingLine(ctx, 'hs');
    }

    this.state.points.forEach(point => {
        const x = point.hsPos.u * this.state.transform.scale + this.state.transform.offsetX;
        const y = point.hsPos.v * this.state.transform.scale + this.state.transform.offsetY;
        const color = this.abstractToRgb(point.hsPos.u, point.hsPos.v, point.lightness);
        const {r, g, b} = this.clampColor(color);

        const isSelected = this.state.selectedPointIds.has(point.id);
        const isLastSelected = point.id === this.state.lastSelectedPointId;
        const isOnCurrentPlane = Math.abs(point.lightness - this.state.viewLightness) < 0.01;

        ctx.save();
        
        ctx.beginPath();
        switch (point.order) {
            case 0: this._drawCircle(ctx, x, y, C.NODE_RADIUS); break;
            case 1: this._drawDroplet(ctx, x, y, C.NODE_RADIUS); break;
            case 2: this._drawEye(ctx, x, y, C.NODE_RADIUS); break;
            case 3: this._drawTriangle(ctx, x, y, C.NODE_RADIUS); break;
            case 4: this._drawSquare(ctx, x, y, C.NODE_RADIUS); break;
            default: this._drawCircle(ctx, x, y, C.NODE_RADIUS);
        }

        ctx.globalAlpha = point.alpha;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();

        ctx.globalAlpha = 1.0;
        if (isOnCurrentPlane) {
            ctx.strokeStyle = isSelected ? C.COLOR_SELECTION_BLUE : 'black';
            ctx.lineWidth = isLastSelected ? C.LINE_WIDTH_SELECTED : C.LINE_WIDTH_DEFAULT;
            ctx.stroke();
        } else {
            ctx.setLineDash(C.DASHED_LINE_STYLE);
            ctx.strokeStyle = isSelected ? C.COLOR_SELECTION_BLUE : 'black';
            ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    });
}