// script.js

import * as C from './constants.js';

class ColorEditor {
    constructor() {
        // Initializes state with a consistent ID for the first point
        const initialPointId = Date.now();
        const initialPoint = {
            id: initialPointId,
            hsPos: { u: 0, v: 0 },
            originalHsPos: { u: 0, v: 0 },
            brightness: 0.5,
            alpha: 1.0,
        };

        this.state = {
            points: [initialPoint],
            selectedPointIds: new Set([initialPointId]),
            lastSelectedPointId: initialPointId,
            activeDrag: { type: null, element: null, pointId: null },
            transform: { scale: 1, offsetX: 0, offsetY: 0 },
            viewBrightness: initialPoint.brightness,
            viewAlpha: initialPoint.alpha,
            undoStack: [],
            redoStack: [],
        };

        this.validPointsCache = null;
        this.clickCount = 0;
        this.lastClickTime = 0;
        this.lastClickTarget = null;

        this.initializeDOM();
        this.setupCanvases();
        this.setupEventListeners();
    }

    saveState() {
        this.state.redoStack = [];
        const currentState = JSON.parse(JSON.stringify(this.state.points));
        this.state.undoStack.push(currentState);
    }

    undo() {
        if (this.state.undoStack.length === 0) return;

        const currentState = JSON.parse(JSON.stringify(this.state.points));
        this.state.redoStack.push(currentState);
        
        const previousState = this.state.undoStack.pop();
        this.state.points = previousState;

        this.state.selectedPointIds.clear();
        this.state.lastSelectedPointId = null;

        this.drawAll();
    }

    redo() {
        if (this.state.redoStack.length === 0) return;

        const currentState = JSON.parse(JSON.stringify(this.state.points));
        this.state.undoStack.push(currentState);

        const nextState = this.state.redoStack.pop();
        this.state.points = nextState;
        
        this.state.selectedPointIds.clear();
        this.state.lastSelectedPointId = null;

        this.drawAll();
    }

    
    deselectAll() {
        if (this.state.selectedPointIds.size > 0) {
            this.state.selectedPointIds.clear();
            this.state.lastSelectedPointId = null;
            this.drawAll();
        }
    }

    initializeDOM() {
        this.elements = {
            hsBgCanvas: document.getElementById('hs-bg-canvas'),
            hsNodesContainer: document.getElementById('hs-nodes-container'),
            brightnessBgCanvas: document.getElementById('brightness-bg-canvas'),
            brightnessNodesContainer: document.getElementById('brightness-nodes-container'),
            alphaBgCanvas: document.getElementById('alpha-bg-canvas'),
            alphaNodesContainer: document.getElementById('alpha-nodes-container'),
            colormapPreviewCanvas: document.getElementById('colormap-preview-canvas'),
            brightnessValue: document.getElementById('brightness-value'),
            alphaValue: document.getElementById('alpha-value'),
            rgbValue: document.getElementById('rgb-value'),
            // This object will hold the interactive canvases so they aren't deleted
            interactiveCanvases: {}
        };

        // Create the interactive canvases ONCE
        this.createInteractiveCanvas(this.elements.hsNodesContainer, 'hs');
        this.createInteractiveCanvas(this.elements.brightnessNodesContainer, 'brightness');
        this.createInteractiveCanvas(this.elements.alphaNodesContainer, 'alpha');
    }

    // Helper to create a canvas and store its reference
    createInteractiveCanvas(container, type) {
        const canvas = document.createElement('canvas');
        canvas.className = `interactive-canvas ${type}-interactive`;
        canvas.dataset.type = type;
        container.appendChild(canvas);
        this.elements.interactiveCanvases[type] = canvas;
    }

    setupCanvases() {
        // Standard setup for all other canvases
        const otherCanvases = [
            { c: this.elements.brightnessBgCanvas, container: this.elements.brightnessBgCanvas.parentElement },
            { c: this.elements.alphaBgCanvas, container: this.elements.alphaBgCanvas.parentElement },
            { c: this.elements.colormapPreviewCanvas, container: this.elements.colormapPreviewCanvas.parentElement },
        ];

        otherCanvases.forEach(item => {
            const { clientWidth, clientHeight } = item.container;
            if (item.c.width !== clientWidth || item.c.height !== clientHeight) {
                item.c.width = clientWidth;
                item.c.height = clientHeight;
            }
            // Also apply to their corresponding interactive canvases
            const type = item.c.id.split('-')[0];
            if (this.elements.interactiveCanvases[type]) {
                const interactiveCanvas = this.elements.interactiveCanvases[type];
                if (interactiveCanvas.width !== clientWidth || interactiveCanvas.height !== clientHeight) {
                    interactiveCanvas.width = clientWidth;
                    interactiveCanvas.height = clientHeight;
                }
            }
        });

        // Special square setup for the HS canvas
        const hsBgCanvas = this.elements.hsBgCanvas;
        const hsInteractiveCanvas = this.elements.interactiveCanvases['hs'];
        const hsContainer = hsBgCanvas.parentElement;

        const containerWidth = hsContainer.clientWidth;
        const containerHeight = hsContainer.clientHeight;

        // Calculate the largest square size that is a multiple of the checkerboard size
        let size = Math.min(containerWidth, containerHeight);
        size = Math.floor(size / C.CHECKERBOARD_SIZE) * C.CHECKERBOARD_SIZE;

        // Apply the new square size to the HS canvases
        [hsBgCanvas, hsInteractiveCanvas].forEach(canvas => {
            canvas.width = size;
            canvas.height = size;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            canvas.style.left = `${(containerWidth - size) / 2}px`;
            canvas.style.top = `${(containerHeight - size) / 2}px`;
        });
        
        this.drawAll();
    }

    setupEventListeners() {
        const mainContainer = document.querySelector('.w-full.h-\\[400px\\]');
        if (mainContainer) {
            mainContainer.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.deselectAll();
            });
        }

        const resizeObserver = new ResizeObserver(() => this.setupCanvases());
        resizeObserver.observe(document.querySelector('.w-full'));
        
        this.elements.hsNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'hs'));
        this.elements.brightnessNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'brightness'));
        this.elements.alphaNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'alpha'));

        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleKeyDown(e) {
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
                        brightness: 0.5,
                        alpha: 1.0,
                    };
                    this.state.points.push(initialPoint);
                    this.state.selectedPointIds.add(initialPoint.id);
                    this.state.lastSelectedPointId = initialPoint.id;
                }
                this.drawAll();
            }
        }
    }

    findSnapPosition(currentY, canvasHeight, sliderType, ignorePointId = null) {
        let snappedY = currentY;
        let minDistance = C.SNAP_DISTANCE + 1;

        this.state.points.forEach(point => {
            if (point.id === ignorePointId) {
                return;
            }

            const pointY = (1 - point[sliderType]) * canvasHeight;
            const distance = Math.abs(currentY - pointY);

            if (distance < C.SNAP_DISTANCE && distance < minDistance) {
                snappedY = pointY;
                minDistance = distance;
            }
        });

        return snappedY;
    }

    getLastSelectedPoint() {
        if (!this.state.lastSelectedPointId) {
            // If nothing is selected, we can return null or a default object.
            // Returning the first point is a safe fallback.
            return this.state.points[0] || null;
        }
        return this.state.points.find(p => p.id === this.state.lastSelectedPointId);
    }

    getPointById(id) {
        return this.state.points.find(p => p.id === id);
    }

    drawAll() {
        this.drawHSSlice();
        this.drawSliderBackgrounds();
        this.renderNodes();
        this.updateUIReadouts();
    }


    updateValidPointsCache(width, height, brightness) {
        this.validPointsCache = new Set();
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const au = (i - this.state.transform.offsetX) / this.state.transform.scale;
                const av = (j - this.state.transform.offsetY) / this.state.transform.scale;
                const {r, g, b} = this.abstractToRGB(au, av, brightness);
                if (this.isValidColor(r, g, b)) {
                    this.validPointsCache.add(`${i},${j}`);
                }
            }
        }
    }

    isValidColor(r, g, b) {
        return r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001;
    }

    drawSliderBackgrounds() {
        const bCtx = this.elements.brightnessBgCanvas.getContext('2d');
        const bGrad = bCtx.createLinearGradient(0, 0, 0, this.elements.brightnessBgCanvas.height);
        bGrad.addColorStop(0, 'white');
        bGrad.addColorStop(1, 'black');
        bCtx.fillStyle = bGrad;
        bCtx.fillRect(0, 0, this.elements.brightnessBgCanvas.width, this.elements.brightnessBgCanvas.height);

        const aCtx = this.elements.alphaBgCanvas.getContext('2d');
        this.drawCheckerboard(aCtx);
        const aGrad = aCtx.createLinearGradient(0, 0, 0, this.elements.alphaBgCanvas.height);
        aGrad.addColorStop(0, 'white');
        aGrad.addColorStop(1, 'rgba(255,255,255,0)');
        aCtx.fillStyle = aGrad;
        aCtx.fillRect(0, 0, this.elements.alphaBgCanvas.width, this.elements.alphaBgCanvas.height);
    }

    renderNodes() {
        this.drawHSElements();
        this.drawBrightnessElements();
        this.drawAlphaElements();
    }

    

    drawHSSlice() {
        // The HS plane is now drawn based on the viewBrightness, not the active point's brightness.
        const { viewBrightness, viewAlpha } = this.state;
        const width = this.elements.hsBgCanvas.width;
        const height = this.elements.hsBgCanvas.height;
        
        if (width === 0 || height === 0) return;
        
        const ctx = this.elements.hsBgCanvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        this.drawCheckerboard(ctx);

        const maxRadius = Math.sqrt(2/3);
        const scale = Math.min(width, height) / (maxRadius * 2) * C.HS_PLANE_SCALE_FACTOR;
        this.state.transform.scale = scale;
        this.state.transform.offsetX = width / 2;
        this.state.transform.offsetY = height / 2;

        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const au = (i - this.state.transform.offsetX) / this.state.transform.scale;
                const av = (j - this.state.transform.offsetY) / this.state.transform.scale;
                const {r, g, b} = this.abstractToRGB(au, av, viewBrightness);
                const index = (j * width + i) * 4;
                
                if (this.isValidColor(r, g, b)) {
                    data[index] = Math.round(r * 255);
                    data[index + 1] = Math.round(g * 255);
                    data[index + 2] = Math.round(b * 255);
                    data[index + 3] = 255;
                }
            }
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        ctx.globalAlpha = viewAlpha;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalAlpha = 1.0;

        this.updateValidPointsCache(width, height, viewBrightness);
    }

    drawHorizontalLine(ctx, y) {
        ctx.strokeStyle = C.COLOR_HORIZONTAL_LINE;
        ctx.lineWidth = C.LINE_WIDTH_HORIZONTAL;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width, y);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawConnectingLine(ctx, type) {
        ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
        ctx.globalAlpha = 0.7;

        const getCoords = (point, index) => {
            let x, y;
            if (type === 'hs') {
                x = point.hsPos.u * this.state.transform.scale + this.state.transform.offsetX;
                y = point.hsPos.v * this.state.transform.scale + this.state.transform.offsetY;
            } else {
                x = (this.state.points.length > 1 ? index / (this.state.points.length - 1) : 0.5) * ctx.canvas.width;
                if (type === 'brightness') {
                    y = (1 - point.brightness) * ctx.canvas.height;
                } else { // alpha
                    y = (1 - point.alpha) * ctx.canvas.height;
                }
            }
            return { x, y };
        };

        for (let i = 0; i < this.state.points.length - 1; i++) {
            const p1 = this.state.points[i];
            const p2 = this.state.points[i + 1];

            const startCoords = getCoords(p1, i);
            const endCoords = getCoords(p2, i + 1);

            ctx.setLineDash([]);

            if (type === 'hs') {
                ctx.strokeStyle = 'black';
                const p1OnPlane = Math.abs(p1.brightness - this.state.viewBrightness) < 0.01;
                const p2OnPlane = Math.abs(p2.brightness - this.state.viewBrightness) < 0.01;
                if (!p1OnPlane || !p2OnPlane) {
                    ctx.setLineDash(C.DASHED_LINE_STYLE);
                }
            } else {
                const gradient = ctx.createLinearGradient(startCoords.x, startCoords.y, endCoords.x, endCoords.y);
                
                const color1 = this.abstractToRGB(p1.hsPos.u, p1.hsPos.v, p1.brightness);
                const rgb1 = this.clampColor(color1);
                gradient.addColorStop(0, `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, ${p1.alpha})`);

                const color2 = this.abstractToRGB(p2.hsPos.u, p2.hsPos.v, p2.brightness);
                const rgb2 = this.clampColor(color2);
                gradient.addColorStop(1, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${p2.alpha})`);
                
                ctx.strokeStyle = gradient;
            }

            const dx = endCoords.x - startCoords.x;
            const dy = endCoords.y - startCoords.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > C.NODE_RADIUS * 2) {
                const ratio = C.NODE_RADIUS / dist;
                const offsetX = dx * ratio;
                const offsetY = dy * ratio;

                ctx.beginPath();
                ctx.moveTo(startCoords.x + offsetX, startCoords.y + offsetY);
                ctx.lineTo(endCoords.x - offsetX, endCoords.y - offsetY);
                ctx.stroke();
            }
        }
        
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
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
            const color = this.abstractToRGB(point.hsPos.u, point.hsPos.v, point.brightness);
            const {r, g, b} = this.clampColor(color);

            const isSelected = this.state.selectedPointIds.has(point.id);
            const isLastSelected = point.id === this.state.lastSelectedPointId;
            const isOnCurrentPlane = Math.abs(point.brightness - this.state.viewBrightness) < 0.01;

            ctx.save();
            
            ctx.beginPath();
            ctx.arc(x, y, C.NODE_RADIUS, 0, 2 * Math.PI);

            // 1. Draw the fill with the correct alpha
            ctx.globalAlpha = point.alpha;
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fill();

            // 2. Draw the stroke with full opacity
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

    drawBrightnessElements() {
        const canvas = this.elements.interactiveCanvases['brightness'];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawHorizontalLine(ctx, (1 - this.state.viewBrightness) * canvas.height);
        if (this.state.points.length > 1) {
            this.drawConnectingLine(ctx, 'brightness');
        }
        this.state.points.forEach((point, index) => {
            const x = (this.state.points.length === 1 ? 0.5 : index / (this.state.points.length - 1)) * canvas.width;
            const y = (1 - point.brightness) * canvas.height;
            const color = this.abstractToRGB(point.hsPos.u, point.hsPos.v, point.brightness);
            const {r, g, b} = this.clampColor(color);
            const isSelected = this.state.selectedPointIds.has(point.id);
            const isLastSelected = point.id === this.state.lastSelectedPointId;
            this.drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected);
        });
    }

    drawAlphaElements() {
        const canvas = this.elements.interactiveCanvases['alpha'];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawHorizontalLine(ctx, (1 - this.state.viewAlpha) * canvas.height);
        if (this.state.points.length > 1) {
            this.drawConnectingLine(ctx, 'alpha');
        }
        this.state.points.forEach((point, index) => {
            const x = (this.state.points.length === 1 ? 0.5 : index / (this.state.points.length - 1)) * canvas.width;
            const y = (1 - point.alpha) * canvas.height;
            const color = this.abstractToRGB(point.hsPos.u, point.hsPos.v, point.brightness);
            const {r, g, b} = this.clampColor(color);
            const isSelected = this.state.selectedPointIds.has(point.id);
            const isLastSelected = point.id === this.state.lastSelectedPointId;
            this.drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected);
        });
    }

    drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected) {
        ctx.beginPath();
        ctx.arc(x, y, C.NODE_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        ctx.strokeStyle = isSelected ? C.COLOR_SELECTION_BLUE : 'black';
        ctx.lineWidth = isLastSelected ? C.LINE_WIDTH_SELECTED : C.LINE_WIDTH_DEFAULT;
        ctx.stroke();
    }

    clampColor(color) {
        return {
            r: Math.round(Math.max(0, Math.min(255, color.r * 255))),
            g: Math.round(Math.max(0, Math.min(255, color.g * 255))),
            b: Math.round(Math.max(0, Math.min(255, color.b * 255)))
        };
    }

    updateUIReadouts() {
        const lastSelectedPoint = this.getLastSelectedPoint();
        
        if (!lastSelectedPoint) {
            // If no point is selected, clear the readouts or show default values.
            this.elements.brightnessValue.textContent = '--';
            this.elements.alphaValue.textContent = '--';
            this.elements.rgbValue.textContent = 'rgb(-,-,-)';
            this.drawColormapPreview();
            return;
        }

        const { brightness, alpha, hsPos } = lastSelectedPoint;
        this.elements.brightnessValue.textContent = brightness.toFixed(2);
        this.elements.alphaValue.textContent = alpha.toFixed(2);
        const color = this.abstractToRGB(hsPos.u, hsPos.v, brightness);
        const {r, g, b} = this.clampColor(color);
        this.elements.rgbValue.textContent = `rgb(${r},${g},${b})`;
        
        this.drawColormapPreview();
    }

    drawColormapPreview() {
        const previewCtx = this.elements.colormapPreviewCanvas.getContext('2d');
        this.drawCheckerboard(previewCtx);
        if (this.state.points.length === 1) {
            const point = this.state.points[0];
            const color = this.abstractToRGB(point.hsPos.u, point.hsPos.v, point.brightness);
            const {r, g, b} = this.clampColor(color);
            previewCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${point.alpha})`;
            previewCtx.fillRect(0, 0, this.elements.colormapPreviewCanvas.width, this.elements.colormapPreviewCanvas.height);
        } else {
            const gradient = previewCtx.createLinearGradient(0, 0, this.elements.colormapPreviewCanvas.width, 0);
            this.state.points.forEach((point, index) => {
                const stop = index / (this.state.points.length - 1);
                const pointColor = this.abstractToRGB(point.hsPos.u, point.hsPos.v, point.brightness);
                const {r, g, b} = this.clampColor(pointColor);
                gradient.addColorStop(stop, `rgba(${r}, ${g}, ${b}, ${point.alpha})`);
            });
            previewCtx.fillStyle = gradient;
            previewCtx.fillRect(0, 0, this.elements.colormapPreviewCanvas.width, this.elements.colormapPreviewCanvas.height);
        }
    }

    abstractToRGB(u, v, brightness) {
        const basis1 = { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(2), z: 0 };
        const basis2 = { x: 1 / Math.sqrt(6), y: 1 / Math.sqrt(6), z: -2 / Math.sqrt(6) };
        const r = brightness + u * basis1.x + v * basis2.x;
        const g = brightness + u * basis1.y + v * basis2.y;
        const b = brightness + u * basis1.z + v * basis2.z;
        return {r, g, b};
    }

    drawCheckerboard(ctx) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const numSquaresW = width / C.CHECKERBOARD_SIZE;
        const numSquaresH = height / C.CHECKERBOARD_SIZE;

        ctx.fillStyle = C.COLOR_CHECKER_DARK;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = C.COLOR_CHECKER_LIGHT;
        
        for (let i = 0; i < numSquaresH; i++) {
            for (let j = 0; j < numSquaresW; j++) {
                if ((i + j) % 2 === 0) {
                    ctx.fillRect(j * C.CHECKERBOARD_SIZE, i * C.CHECKERBOARD_SIZE, C.CHECKERBOARD_SIZE, C.CHECKERBOARD_SIZE);
                }
            }
        }
    }

    findClosestValidPoint(targetX, targetY) {
        if (!this.validPointsCache || this.validPointsCache.size === 0) {
            return { x: this.state.transform.offsetX, y: this.state.transform.offsetY };
        }

        const centerX = this.state.transform.offsetX;
        const centerY = this.state.transform.offsetY;
        const width = this.elements.hsBgCanvas.width;
        const height = this.elements.hsBgCanvas.height;

        const roundedX = Math.round(targetX);
        const roundedY = Math.round(targetY);
        if (roundedX >= 0 && roundedX < width && roundedY >= 0 && roundedY < height) {
            if (this.validPointsCache.has(`${roundedX},${roundedY}`)) {
                return { x: roundedX, y: roundedY };
            }
        }

        const vecX = targetX - centerX;
        const vecY = targetY - centerY;
        const dist = Math.sqrt(vecX * vecX + vecY * vecY);

        if (dist < 1) {
            return { x: centerX, y: centerY };
        }

        const steps = Math.ceil(dist);
        for (let i = steps; i >= 0; i--) {
            const fraction = i / steps;
            const checkX = Math.round(centerX + vecX * fraction);
            const checkY = Math.round(centerY + vecY * fraction);

            if (this.validPointsCache.has(`${checkX},${checkY}`)) {
                return { x: checkX, y: checkY };
            }
        }

        return { x: centerX, y: centerY };
    }

    constrainPointToValidArea(point) {
        let u = point.originalHsPos.u;
        let v = point.originalHsPos.v;

        // Start from the point's original position and step towards the gray center
        // to find the first valid color along that line.
        for (let i = 10; i >= 0; i--) {
            const fraction = i / 10.0;
            const testU = u * fraction;
            const testV = v * fraction;
            const { r, g, b } = this.abstractToRGB(testU, testV, point.brightness);

            if (this.isValidColor(r, g, b)) {
                point.hsPos = { u: testU, v: testV };
                return;
            }
        }
        
        // If no valid color is found (highly unlikely), snap to gray.
        point.hsPos = { u: 0, v: 0 };
    }

    handleMouseDown(e, type) {
        if (e.button === 2) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        const timeSinceLastClick = now - this.lastClickTime;

        const canvas = this.elements.interactiveCanvases[type];
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const startPos = { x, y };
        let hasDragged = false;
        
        let hitPoint = null;
        let hitLine = false;
        
        if (type === 'hs') {
            hitPoint = this.findHitPointHS(x, y);
        } else {
            const result = this.findHitPointSlider(x, y, type);
            hitPoint = result.hitPoint;
            hitLine = result.hitLine;
        }

        if (timeSinceLastClick < C.DBL_CLICK_SPEED && hitPoint && hitPoint.id === this.lastClickTarget) {
            this.clickCount++;
        } else {
            this.clickCount = 1;
        }
        this.lastClickTime = now;
        this.lastClickTarget = hitPoint ? hitPoint.id : null;

        if (hitPoint) {
            if (!this.state.selectedPointIds.has(hitPoint.id) && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                this.state.selectedPointIds.clear();
                this.state.selectedPointIds.add(hitPoint.id);
                this.state.lastSelectedPointId = hitPoint.id;
            }

            const offsets = new Map();
            if (this.state.selectedPointIds.has(hitPoint.id)) {
                this.state.points.forEach(p => {
                    if (this.state.selectedPointIds.has(p.id)) {
                        offsets.set(p.id, {
                            u: p.hsPos.u - hitPoint.hsPos.u,
                            v: p.hsPos.v - hitPoint.hsPos.v,
                            brightness: p.brightness - hitPoint.brightness,
                            alpha: p.alpha - hitPoint.alpha
                        });
                    }
                });
            }
            this.state.activeDrag = { type, element: canvas, pointId: hitPoint.id, offsets };

        } else if (hitLine) {
            this.state.selectedPointIds.clear();
            this.state.lastSelectedPointId = null;
            this.state.activeDrag = { type: type + '-line', element: canvas, pointId: null };
        } else {
            this.state.activeDrag = { type, element: canvas, pointId: null };
        }
        this.drawAll();
        
        const onMove = (moveEvent) => {
            const currentX = (moveEvent.clientX - rect.left) * scaleX;
            const currentY = (moveEvent.clientY - rect.top) * scaleY;
            const dist = Math.sqrt((currentX - startPos.x) ** 2 + (currentY - startPos.y) ** 2);
            if (dist > C.DRAG_THRESHOLD) {
                hasDragged = true;
            }
            if (this.state.activeDrag.type) {
                this.handleMouseMove(moveEvent);
            }
        };
        
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            
            if (hasDragged && this.state.activeDrag.pointId) {
                this.saveState();
            }
            
            if (!hasDragged) {
                this.handleClick(x, y, type, hitPoint, e);
            } else {
                const draggedPoint = this.getPointById(this.state.activeDrag.pointId);
                if (draggedPoint) {
                    this.state.viewBrightness = draggedPoint.brightness;
                    this.state.viewAlpha = draggedPoint.alpha;
                } else if (!hitPoint) {
                    this.state.selectedPointIds.clear();
                    this.state.lastSelectedPointId = null;
                }
            }
            
            this.state.activeDrag = { type: null, element: null, pointId: null, offsets: null };
            this.drawAll();
        };
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    findHitPointHS(x, y) {
        for (const point of this.state.points) {
            const px = point.hsPos.u * this.state.transform.scale + this.state.transform.offsetX;
            const py = point.hsPos.v * this.state.transform.scale + this.state.transform.offsetY;
            const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (distance <= C.NODE_HIT_RADIUS) {
                return point;
            }
        }
        return null;
    }

    findHitPointSlider(x, y, type) {
        const canvas = this.elements.interactiveCanvases[type];
        // FIX: The line's position is determined by the "view" state, not the active point.
        // This allows the line to be detected and dragged even when no point is selected.
        const lineY = type === 'brightness' ? (1 - this.state.viewBrightness) * canvas.height : (1 - this.state.viewAlpha) * canvas.height;
        let hitLine = Math.abs(y - lineY) <= C.LINE_HIT_RADIUS;
        
        let hitPoint = null;
        for (let i = 0; i < this.state.points.length; i++) {
            const point = this.state.points[i];
            const px = (this.state.points.length === 1 ? 0.5 : i / (this.state.points.length - 1)) * canvas.width;
            const py = type === 'brightness' ? (1 - point.brightness) * canvas.height : (1 - point.alpha) * canvas.height;
            const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (distance <= C.NODE_HIT_RADIUS) {
                hitPoint = point;
                break;
            }
        }
        return { hitPoint, hitLine };
    }

    handleClick(x, y, type, hitPoint, e) {
        const { shiftKey, ctrlKey, metaKey } = e;
        const isCtrlPressed = ctrlKey || metaKey;

        if (hitPoint) {
            const { selectedPointIds } = this.state;
            const pointId = hitPoint.id;

            if (this.clickCount === 3) {
                this.state.points.forEach(p => selectedPointIds.add(p.id));
                this.state.lastSelectedPointId = pointId;
            } else if (this.clickCount === 2) {
                const hitIndex = this.state.points.findIndex(p => p.id === pointId);
                selectedPointIds.clear();
                const indicesToSelect = [hitIndex - 1, hitIndex, hitIndex + 1];
                indicesToSelect.forEach(index => {
                    if (index >= 0 && index < this.state.points.length) {
                        selectedPointIds.add(this.state.points[index].id);
                    }
                });
                this.state.lastSelectedPointId = pointId;
            } else if (isCtrlPressed) {
                if (selectedPointIds.has(pointId)) {
                    selectedPointIds.delete(pointId);
                    if (this.state.lastSelectedPointId === pointId) {
                        this.state.lastSelectedPointId = selectedPointIds.values().next().value || null;
                    }
                } else {
                    selectedPointIds.add(pointId);
                    this.state.lastSelectedPointId = pointId;
                }
            } else if (shiftKey) {
                selectedPointIds.add(pointId);
                this.state.lastSelectedPointId = pointId;
            } else {
                selectedPointIds.clear();
                selectedPointIds.add(pointId);
                this.state.lastSelectedPointId = pointId;
            }
            
            this.state.viewBrightness = hitPoint.brightness;
            this.state.viewAlpha = hitPoint.alpha;

        } else if (type === 'hs') {
            this.createNewPointHS(x, y);
        } else if (type === 'brightness' || type === 'alpha') {
            const canvas = this.elements.interactiveCanvases[type];
            const value = Math.max(0, Math.min(1, 1 - (y / canvas.height)));
            if (type === 'brightness') {
                this.state.viewBrightness = value;
            } else {
                this.state.viewAlpha = value;
            }
        }
        this.drawAll();
    }

    createNewPointHS(x, y) {
        const au = (x - this.state.transform.offsetX) / this.state.transform.scale;
        const av = (y - this.state.transform.offsetY) / this.state.transform.scale;
        
        const { viewBrightness, viewAlpha } = this.state;
        const {r, g, b} = this.abstractToRGB(au, av, viewBrightness);

        if (this.isValidColor(r, g, b)) {
            this.saveState();

            const newPoint = {
                id: Date.now(),
                hsPos: {u: au, v: av},
                originalHsPos: {u: au, v: av},
                brightness: viewBrightness,
                alpha: viewAlpha,
            };
            this.state.points.push(newPoint);

            this.state.selectedPointIds.clear();
            this.state.selectedPointIds.add(newPoint.id);
            this.state.lastSelectedPointId = newPoint.id;
            
            this.drawAll();
        }
    }


    handleLineDrag(y, canvasHeight, dragType) {
        const propertyName = dragType.startsWith('brightness') ? 'brightness' : 'alpha';
        const viewProperty = dragType.startsWith('brightness') ? 'viewBrightness' : 'viewAlpha';

        const snappedY = this.findSnapPosition(y, canvasHeight, propertyName);
        const targetValue = Math.max(0, Math.min(1, 1 - (snappedY / canvasHeight)));
        
        this.state[viewProperty] = targetValue;
    }

    handlePointDrag(x, y, canvas, dragType) {
        const point = this.getPointById(this.state.activeDrag.pointId);
        if (!point) return;
        if (dragType === 'hs') {
            this.handleHSPointDrag(point, x, y);
        } else if (dragType === 'brightness' || dragType === 'alpha') {
            this.handleSliderPointDrag(point, y, canvas.height, dragType);
        }
    }

    handleMouseMove(e) {
        if (!this.state.activeDrag.type) return;
        e.preventDefault();
        const { type, element, pointId } = this.state.activeDrag;
        const canvas = element;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        if (type.endsWith('-line')) {
            this.handleLineDrag(y, canvas.height, type);
        } else if (pointId) {
            this.handlePointDrag(x, y, canvas, type);
        }
        this.drawAll();
    }

    handleHSPointDrag(point, x, y) {
        const { offsets } = this.state.activeDrag;
        
        const primaryU = (x - this.state.transform.offsetX) / this.state.transform.scale;
        const primaryV = (y - this.state.transform.offsetY) / this.state.transform.scale;

        const proposedPositions = [];
        let allValid = true;

        for (const p of this.state.points) {
            if (offsets.has(p.id)) {
                const offset = offsets.get(p.id);
                const newU = primaryU + offset.u;
                const newV = primaryV + offset.v;
                proposedPositions.push({ point: p, u: newU, v: newV });

                const { r, g, b } = this.abstractToRGB(newU, newV, p.brightness);
                if (!this.isValidColor(r, g, b)) {
                    allValid = false;
                    break;
                }
            }
        }

        if (allValid) {
            proposedPositions.forEach(({ point, u, v }) => {
                point.hsPos = { u, v };
                point.originalHsPos = { u, v };
            });
        }
    }

    handleSliderPointDrag(point, y, canvasHeight, dragType) {
        const { offsets } = this.state.activeDrag;
        const primaryValue = Math.max(0, Math.min(1, 1 - (y / canvasHeight)));
        
        let minPossibleValue = 0;
        let maxPossibleValue = 1;

        for (const p of this.state.points) {
            if (offsets.has(p.id)) {
                const offsetValue = offsets.get(p.id)[dragType];
                minPossibleValue = Math.max(minPossibleValue, -offsetValue);
                maxPossibleValue = Math.min(maxPossibleValue, 1 - offsetValue);
            }
        }
        
        const clampedPrimaryValue = Math.max(minPossibleValue, Math.min(maxPossibleValue, primaryValue));

        for (const p of this.state.points) {
            if (offsets.has(p.id)) {
                const offset = offsets.get(p.id);
                p[dragType] = clampedPrimaryValue + offset[dragType];

                if (dragType === 'brightness') {
                    this.constrainPointToValidArea(p);
                }
            }
        }

        if (dragType === 'brightness') {
            this.state.viewBrightness = point.brightness;
            this.updateValidPointsCache(
                this.elements.hsBgCanvas.width,
                this.elements.hsBgCanvas.height,
                point.brightness
            );
        } else {
            this.state.viewAlpha = point.alpha;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ColorEditor();
});
