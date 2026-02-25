// In a file named 'ColormapSelector.js'
import * as C from './constants.js';
import namedColorsData from './namedColors.js';
import namedColormapsData from './namedColormaps.js';

export default class ColormapSelector {
    constructor(customColors = {}, customColormaps = {}) {
        this.state = {
            points: [],
            selectedPointIds: new Set(),
            lastSelectedPointId: null,
            activeDrag: { type: null, element: null, pointId: null },
            transform: { scale: 1, offsetX: 0, offsetY: 0 },
            viewLightness: 0.5,
            viewAlpha: 1.0,
            colorSpace: 'RGB_CUBE',
            undoStack: [],
            redoStack: [],
            isMouseInCanvas: false,
            isDirty: false,
            loadedColormapName: null,
            loadedColormapType: null,
            isCyclic: false,
            cyclicStateWhenEnabled: null,
            colormapId: null
        };

        this.namedColors = {};
        this.customColors = { ...customColors };
        this.namedColormaps = {};
        this.customColormaps = { ...customColormaps };

        this.clickCount = 0;
        this.lastClickTime = 0;
        this.lastClickTarget = null;

        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.initialLeft = 0;
        this.initialTop = 0;
        
        this.wrapper = null;
        this.elements = {};
    }

    initialize() {
        try {
            this.namedColors = namedColorsData;
            this.namedColormaps = namedColormapsData;

            this.initializeDOM();
            this.populatePresets();
            
            this.state.points = [];
            this.state.selectedPointIds.clear();
            this.state.lastSelectedPointId = null;
            this.state.viewLightness = 0.5;
            this.state.viewAlpha = 1.0;
            this.state.loadedColormapName = null;
            this.state.loadedColormapType = null;
            this.state.isCyclic = false;
            this.state.originalPositions = null;
            this.setDirty(false);
            
            this.updateTabs();
            this.setupCanvases();
            this.setupEventListeners();
            this.drawAll();
        } catch (error) {
            console.error("FATAL: Could not initialize ColorEditor.", error);
            if (this.wrapper) {
                this.wrapper.innerHTML = `<div style="padding: 1em; color: #d8000c; background-color: #ffbaba; border: 1px solid; border-radius: 0.5rem; font-family: sans-serif;"><strong>Error:</strong> Could not load critical data files.</div>`;
                this.show();
            }
        }
    }

    hide() {
    if (!this.wrapper) return;
    
    // Clean up all tick labels
    const allTickLabels = document.querySelectorAll('[data-tick-canvas]');
    allTickLabels.forEach(label => label.remove());
    
    this.wrapper.style.display = 'none';
}

    getElement() {
        // Returns the main DOM element so it can be appended to the page
        return this.wrapper;
    }


    show(x, y, initialState = null) {
        if (!this.wrapper) return;

        this.wrapper.style.visibility = 'hidden';
        this.wrapper.style.display = 'grid';

        requestAnimationFrame(() => {
            if (x != null && y != null) {
                const constrained = this._constrainToViewport(x, y);
                this.wrapper.style.left = `${constrained.x}px`;
                this.wrapper.style.top = `${constrained.y}px`;
                this.wrapper.style.bottom = null;
                this.wrapper.style.right = null;
            } else {
                this.wrapper.style.left = null;
                this.wrapper.style.top = null;
                this.wrapper.style.bottom = '0.5rem';
                this.wrapper.style.right = '0.5rem';
            }
            this.wrapper.style.visibility = 'visible';

            // Reset state
            this.state.points = [];
            this.state.selectedPointIds.clear();
            this.state.lastSelectedPointId = null;
            this.state.undoStack = [];
            this.state.redoStack = [];
            this.state.isCyclic = false;
            this.state.loadedColormapName = null;
            this.state.loadedColormapType = null;
            this.state.colormapId = null;
            
            let initialViewLightness = 0.5;
            let initialViewAlpha = 1.0;
            
            // Handle different initial state types
            if (initialState) {
                // Restore ID if provided, otherwise a new one will be generated below
                if (initialState.id) {
                    this.state.colormapId = initialState.id;
                }

                switch (initialState.type) {
                    case 'colormapName':
                        // Load a named colormap by name
                        if (initialState.name) {
                            requestAnimationFrame(() => {
                                // Try named colormaps first, then custom
                                if (this.namedColormaps[initialState.name]) {
                                    this.loadColormap(initialState.name, 'named_colormaps', true);
                                } else if (this.customColormaps[initialState.name]) {
                                    this.loadColormap(initialState.name, 'custom_colormaps', true);
                                } else {
                                    console.warn(`Colormap "${initialState.name}" not found`);
                                }
                            });
                            return; // Early return - loadColormap will handle the rest
                        }
                        break;

                    case 'colorName':
                        // Apply a single named color
                        if (initialState.name) {
                            const rgb = this.namedColors[initialState.name] || 
                                    (this.customColors[initialState.name] && this.customColors[initialState.name].rgb);
                            if (rgb) {
                                const r = rgb[0] / 255;
                                const g = rgb[1] / 255;
                                const b = rgb[2] / 255;
                                const alpha = initialState.alpha !== undefined ? initialState.alpha : 1.0;
                                
                                const newPoint = this.createPointFromRgb(r, g, b, alpha, 0.5, 1);
                                this.state.points = [newPoint];
                                this.state.selectedPointIds.add(newPoint.id);
                                this.state.lastSelectedPointId = newPoint.id;
                                
                                initialViewLightness = newPoint.lightness;
                                initialViewAlpha = alpha;
                            } else {
                                console.warn(`Color "${initialState.name}" not found`);
                            }
                        }
                        break;

                    case 'color':
                        // Apply a single RGB color
                        if (initialState.color && Array.isArray(initialState.color) && initialState.color.length >= 3) {
                            const r = initialState.color[0] / 255;
                            const g = initialState.color[1] / 255;
                            const b = initialState.color[2] / 255;
                            const alpha = initialState.alpha !== undefined ? initialState.alpha : 1.0;
                            
                            const newPoint = this.createPointFromRgb(r, g, b, alpha, 0.5, 1);
                            this.state.points = [newPoint];
                            this.state.selectedPointIds.add(newPoint.id);
                            this.state.lastSelectedPointId = newPoint.id;
                            
                            initialViewLightness = newPoint.lightness;
                            initialViewAlpha = alpha;
                        }
                        break;

                    case 'colormap':
                        // Load colormap from points/controlPoints data.
                        // We prioritize controlPoints (sparse data) to ensure we load the editable resolution
                        // rather than the interpolated result if both are present.
                        const pointsData = initialState.controlPoints || initialState.points;
                        if (pointsData && Array.isArray(pointsData) && pointsData.length > 0) {
                            this.state.isCyclic = initialState.isCyclic === true;
                            
                            let pointsToLoad = JSON.parse(JSON.stringify(pointsData));
                            
                            // Handle single point case
                            if (pointsToLoad.length === 1) {
                                pointsToLoad[0].pos = 0.5;
                                
                                const rgb = pointsToLoad[0].color;
                                const r = rgb[0] / 255;
                                const g = rgb[1] / 255;
                                const b = rgb[2] / 255;
                                
                                const lightness = (r + g + b) / 3;
                                
                                initialViewLightness = lightness;
                                initialViewAlpha = pointsToLoad[0].alpha !== undefined ? pointsToLoad[0].alpha : 1.0;
                            }
                            
                            // Convert points to internal format
                            this.state.points = pointsToLoad.map(p => {
                                const rgb = p.color;
                                const alpha = p.alpha !== undefined ? p.alpha : 1.0;
                                const order = p.order !== undefined ? p.order : 1;
                                return this.createPointFromRgb(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, alpha, p.pos, order);
                            });
                            
                            this.sortPoints();
                            if (this.state.points.length > 0) {
                                this.state.lastSelectedPointId = this.state.points[0].id;
                                this.state.selectedPointIds.add(this.state.points[0].id);
                            }
                        }
                        break;

                    default:
                        console.warn(`Unknown initial state type: ${initialState.type}`);
                        break;
                }
            }
            
            // Generate a new ID if one wasn't loaded or generated
            if (!this.state.colormapId) {
                this.state.colormapId = `cm-${Date.now()}-${Math.floor(Math.random() * 0xFFFFFF).toString(16)}`;
            }
            
            // Set view properties
            this.state.viewLightness = initialViewLightness;
            this.state.viewAlpha = initialViewAlpha;
            
            // Mark as clean since this is initial loading
            this.setDirty(false);

            requestAnimationFrame(() => {
                this.setupCanvases();
                this.drawAll();
            });
        });
    }

    createSnapshot() {
        return {
            points: JSON.parse(JSON.stringify(this.state.points)),
            selectedPointIds: Array.from(this.state.selectedPointIds),
            lastSelectedPointId: this.state.lastSelectedPointId,
            viewLightness: this.state.viewLightness,
            viewAlpha: this.state.viewAlpha,
            colorSpace: this.state.colorSpace,
            isDirty: this.state.isDirty,
            loadedColormapName: this.state.loadedColormapName,
            loadedColormapType: this.state.loadedColormapType,
            isCyclic: this.state.isCyclic,
            originalPositions: this.state.originalPositions
        };
    }

    saveState() {
        this.state.redoStack = [];
        this.state.undoStack.push(this.createSnapshot());
    }

    setDirty(isDirty) {
        if (this.state.isDirty !== isDirty) {
            this.state.isDirty = isDirty;
        }
    }

    restoreState(snapshot) {
        Object.assign(this.state, snapshot);
        this.state.selectedPointIds = new Set(snapshot.selectedPointIds);
        this.sortPoints();
        this.updateTabs();
        this.drawAll();
    }

    undo() {
        if (this.state.undoStack.length === 0) return;
        this.state.redoStack.push(this.createSnapshot());
        this.restoreState(this.state.undoStack.pop());
    }

    redo() {
        if (this.state.redoStack.length === 0) return;
        this.state.undoStack.push(this.createSnapshot());
        this.restoreState(this.state.redoStack.pop());
    }

    async loadAllPresets() {
        const fetchPreset = async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch preset file at ${url}: Status ${response.status}`);
            }
            return await response.json();
        };

        const loadFromStorage = (key) => {
            try {
                const storedData = localStorage.getItem(key);
                return storedData ? JSON.parse(storedData) : {};
            } catch (e) {
                return {};
            }
        };

        // 1. Load defaults and storage
        const [namedColors, storedColors, namedColormaps, storedColormaps] = await Promise.all([
            fetchPreset('named_colors.json'),
            loadFromStorage('custom_colors'),
            fetchPreset('named_colormaps.json'),
            loadFromStorage('custom_colormaps')
        ]);

        this.namedColors = namedColors;
        this.namedColormaps = namedColormaps;

        // 2. Merge: Storage + Constructor Arguments
        // Constructor arguments (this.customColors) take precedence over LocalStorage,
        // allowing you to "force" specific presets via initialization.
        this.customColors = { ...storedColors, ...this.customColors };
        this.customColormaps = { ...storedColormaps, ...this.customColormaps };
    }

    /**
     * Returns the current custom colors and colormaps.
     * Use this data to save to a JSON file.
     */
    getPresetsData() {
        return {
            customColors: { ...this.customColors },
            customColormaps: { ...this.customColormaps }
        };
    }

    saveCustomPresets(type) {
        const saveEvent = new CustomEvent('dataChanged', {
            detail: {
                customColors: { ...this.customColors },
                customColormaps: { ...this.customColormaps }
            },
            bubbles: true,
            cancelable: true
        });
        this.wrapper.dispatchEvent(saveEvent);
    }

    async handlePresetClick(target) {
            const { name, type } = target.dataset;
    
            // This is the corrected condition.
            if (type === 'named_colors' || type === 'custom_colors') {
                let rgb;
                if (type === 'named_colors') {
                    rgb = this.namedColors[name];
                } else {
                    rgb = this.customColors[name]?.rgb;
                }
    
                if (!rgb) {
                    console.error(`RGB undefined for ${name} in ${type}`);
                    return;
                }
                this.applyColorToSelection(rgb);
            } else {
                // This 'else' block will now correctly handle 'named_colormaps' and 'custom_colormaps'.
                if (this.state.isDirty && name !== this.state.loadedColormapName) {
                    const action = await this.showPrompt('You have unsaved changes. Save the current colormap?', ['Save', 'Don\'t Save', 'Cancel']);
                    if (action === 'Cancel') return;
                    if (action === 'Save') {
                        const saved = await this.promptAndSaveNewPreset('custom_colormaps', this.state.loadedColormapName || 'My Colormap');
                        if (!saved) return;
                    }
                }
                this.loadColormap(name, type);
            }
        }
    
        applyColorToSelection(rgb) {
    this.markAsDirty();
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;

    if (this.state.selectedPointIds.size === 0) {
        const n = this.state.points.length;
        if (n > 0) {
            this.state.points.forEach(p => {
                p.pos = p.pos * (n / (n + 1));
            });
        }
        const newPos = n === 0 ? 0.5 : 1.0;
        const newPoint = this.createPointFromRgb(r, g, b, 1.0, newPos, 1);
        this.state.points.push(newPoint);
        this.sortPoints();
    } else {
        this.state.points.forEach(p => {
            if (this.state.selectedPointIds.has(p.id)) {
                const newColor = this.convertRgbToCurrentColorspace(r, g, b);
                p.hsPos = newColor.hsPos;
                p.originalHsPos = { ...newColor.hsPos };
                p.lightness = newColor.lightness;
            }
        });
        
        const lastSelectedPoint = this.getLastSelectedPoint();
        if (lastSelectedPoint) {
            this.state.viewLightness = lastSelectedPoint.lightness;
            this.state.viewAlpha = lastSelectedPoint.alpha;
        }
    }

    this.drawAll();
}
    
    loadColormap(name, type, isInitialLoad = false) {
        if (!isInitialLoad) this.saveState();
        
        // Generate a new ID for the loaded preset
        this.state.colormapId = `cm-${Date.now()}-${Math.floor(Math.random() * 0xFFFFFF).toString(16)}`;

        const colormapData = (type === 'named_colormaps') ? this.namedColormaps[name] : this.customColormaps[name];

        if (!colormapData || !colormapData.points) {
            console.error(`Colormap '${name}' not found or is invalid.`);
            return;
        }

        const newPoints = colormapData.points.map(p => {
            let rgbArray = [0, 0, 0];
            if (typeof p.color === 'string') {
                rgbArray = this.namedColors[p.color] || this.customColors[p.color]?.rgb || rgbArray;
            } else if (Array.isArray(p.color)) {
                rgbArray = p.color;
            }

            const r = rgbArray[0] / 255;
            const g = rgbArray[1] / 255;
            const b = rgbArray[2] / 255;
            const alpha = p.alpha ?? 1.0;
            return this.createPointFromRgb(r, g, b, alpha, p.pos, p.order);
        });

        this.state.points = newPoints;
        this.sortPoints();
        this.state.selectedPointIds.clear();
        this.state.lastSelectedPointId = null;

        // Handle cycling state
        if (type === 'named_colormaps') {
            // Named colormaps always reset cycling to false
            this.state.isCyclic = false;
        } else {
            // Custom colormaps respect saved cycling state
            this.state.isCyclic = colormapData.isCyclic || false;
        }

        this.state.loadedColormapName = name;
        this.state.loadedColormapType = type;
        this.state.originalPositions = null;
        this.setDirty(false);
        this.state.undoStack = [];
        this.state.redoStack = [];
        this.drawAll();
    }

    createConstantButtonIcon() {
    return `<svg width="100%" height="100%" viewBox="0 0 40 20" style="pointer-events: none;">
        <path d="M5,15 L15,15 L15,8 L25,8 L25,12 L35,12" 
              stroke="white" stroke-width="2" fill="none"/>
    </svg>`;
}

createLinearButtonIcon() {
    return `<svg width="100%" height="100%" viewBox="0 0 40 20" style="pointer-events: none;">
        <path d="M5,15 L20,10 L35,5" stroke="white" stroke-width="2" fill="none"/>
    </svg>`;
}

createCubicButtonIcon() {
    return `<svg width="100%" height="100%" viewBox="0 0 40 20" style="pointer-events: none;">
        <path d="M5,15 Q15,5 25,10 T35,8" stroke="white" stroke-width="2" fill="none"/>
    </svg>`;
}
    
    initializeDOM() {
    this.elements = { interactiveCanvases: {} };

    const createEl = (tag, options = {}) => {
        const el = document.createElement(tag);
        if (options.id) {
            el.id = options.id;
            const camelCaseId = options.id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
            this.elements[camelCaseId] = el;
        }
        if (options.className) el.className = options.className;
        if (options.text) el.textContent = options.text;
        if (options.type) el.type = options.type;
        if (options.placeholder) el.placeholder = options.placeholder;
        return el;
    };

    this.wrapper = createEl('div', { id: 'colormap-selector-wrapper' });
    this.wrapper = createEl('div', { id: 'colormap-selector-wrapper' });
    this.wrapper.style.cssText = `
        position: absolute; display: none; z-index: 1000; background-color: #1a202c; 
        padding: 0.5rem; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); 
        bottom: 0.5rem; right: 0.5rem; width: 1100px; height: 50vh; min-height: 400px; min-width: 600px;
    `;

    this.elements.hsBgCanvas = createEl('canvas', { id: 'hs-bg-canvas' });
    this.elements.lightnessBgCanvas = createEl('canvas', { id: 'lightness-bg-canvas' });
    this.elements.alphaBgCanvas = createEl('canvas', { id: 'alpha-bg-canvas' });
    this.elements.colormapPreviewCanvas = createEl('canvas', { id: 'colormap-preview-canvas' });
    this.elements.selectedColorPreviewCanvas = createEl('canvas', { id: 'selected-color-preview-canvas' });

    const hsPane = createEl('div', { id: 'hs-pane-wrapper', className: 'preset-wrapper' });
    const lightnessPane = createEl('div', { id: 'lightness-wrapper', className: 'preset-wrapper' });
    const alphaPane = createEl('div', { id: 'alpha-wrapper', className: 'preset-wrapper' });
    this.elements.colorsPresetsWrapper = createEl('div', { id: 'colors-presets-wrapper', className: 'preset-wrapper' });
    this.elements.colormapsPresetsWrapper = createEl('div', { id: 'colormaps-presets-wrapper', className: 'preset-wrapper' });
    const selectedColorPane = createEl('div', { id: 'selected-color-section', className: 'control-section' });
    const colormapPreviewPane = createEl('div', { id: 'current-colormap-section', className: 'control-section' });

    const hsHeader = createEl('div', { className: 'panel-header' });
    this.elements.tabRgbCube = createEl('button', { id: 'tab-rgb-cube', className: 'tab-button', text: 'RGB Cube' });
    this.elements.tabHslCone = createEl('button', { id: 'tab-hsl-cone', className: 'tab-button', text: 'HSL Di-Cone' });
    hsHeader.append(this.elements.tabRgbCube, this.elements.tabHslCone);
    const hsContainer = createEl('div', { id: 'hs-canvas-container', className: 'canvas-container' });
    const hsNodesContainer = createEl('div', { id: 'hs-nodes-container', className: 'absolute top-0 left-0 w-full h-full' });
    this.elements.hsNodesContainer = hsNodesContainer;
    hsContainer.append(this.elements.hsBgCanvas, hsNodesContainer);
    hsPane.append(hsHeader, hsContainer);

    const lightnessHeader = createEl('h2', { className: 'panel-header', text: 'Lightness' });
    const lightnessContainer = createEl('div', { id: 'lightness-slider-container', className: 'canvas-container' });
    const lightnessNodesContainer = createEl('div', { id: 'lightness-nodes-container', className: 'absolute top-0 left-0 w-full h-full' });
    this.elements.lightnessNodesContainer = lightnessNodesContainer;
    lightnessContainer.append(this.elements.lightnessBgCanvas, lightnessNodesContainer);
    lightnessPane.append(lightnessHeader, lightnessContainer);

    const alphaHeader = createEl('h2', { className: 'panel-header', text: 'Alpha' });
    const alphaContainer = createEl('div', { id: 'alpha-slider-container', className: 'canvas-container' });
    const alphaNodesContainer = createEl('div', { id: 'alpha-nodes-container', className: 'absolute top-0 left-0 w-full h-full' });
    this.elements.alphaNodesContainer = alphaNodesContainer;
    alphaContainer.append(this.elements.alphaBgCanvas, alphaNodesContainer);
    alphaPane.append(alphaHeader, alphaContainer);

    const colorsHeader = createEl('div', { className: 'preset-category-header' });
    colorsHeader.append(createEl('span', { className: 'preset-category-title', text: 'Colors' }), createEl('button', { className: 'add-preset-btn', text: '+' }));
    this.elements.colorsPresetsWrapper.append(colorsHeader, createEl('div', { className: 'preset-items-container' }));

    const colormapsHeader = createEl('div', { className: 'preset-category-header' });
    colormapsHeader.append(createEl('span', { className: 'preset-category-title', text: 'Colormaps' }), createEl('button', { className: 'add-preset-btn', text: '+' }));
    this.elements.colormapsPresetsWrapper.append(colormapsHeader, createEl('div', { className: 'preset-items-container' }));

    const scTitle = createEl('h3', { className: 'section-title', text: 'Selected Color' });
    const scPreviewContainer = createEl('div', { className: 'preview-container' });
    scPreviewContainer.append(this.elements.selectedColorPreviewCanvas);
    const inputsWrapper = createEl('div', { className: 'space-y-2' });
    
    const valuesGrid = createEl('div', { className: 'values-grid' });
    valuesGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem;';
    
    const lightnessGroup = createEl('div');
    this.elements.lightnessInput = createEl('input', { type: 'text', id: 'lightness-input', className: 'value-input' });
    lightnessGroup.append(createEl('h3', { className: 'input-label', text: 'Lightness' }), this.elements.lightnessInput);
    const alphaGroup = createEl('div');
    this.elements.alphaInput = createEl('input', { type: 'text', id: 'alpha-input', className: 'value-input' });
    alphaGroup.append(createEl('h3', { className: 'input-label', text: 'Alpha' }), this.elements.alphaInput);
    const positionGroup = createEl('div');
    this.elements.positionInput = createEl('input', { type: 'text', id: 'position-input', className: 'value-input' });
    positionGroup.append(createEl('h3', { className: 'input-label', text: 'Position' }), this.elements.positionInput);
    valuesGrid.append(lightnessGroup, alphaGroup, positionGroup);
    
    this.elements.rgbInputsContainer = createEl('div', { id: 'rgb-inputs-container' });
    this.elements.rgbInputsContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem; margin-top: 0.25rem;';
    const redInput = createEl('input', { type: 'text', id: 'rgb-r-input', placeholder: 'R', className: 'value-input' });
    const greenInput = createEl('input', { type: 'text', id: 'rgb-g-input', placeholder: 'G', className: 'value-input' });
    const blueInput = createEl('input', { type: 'text', id: 'rgb-b-input', placeholder: 'B', className: 'value-input' });
    this.elements.rgbRInput = redInput;
    this.elements.rgbGInput = greenInput;
    this.elements.rgbBInput = blueInput;
    this.elements.rgbInputsContainer.append(redInput, greenInput, blueInput);
    
    this.elements.hslInputsContainer = createEl('div', { id: 'hsl-inputs-container', className: 'hidden' });
    this.elements.hslInputsContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; margin-top: 0.25rem;';
    const hueInput = createEl('input', { type: 'text', id: 'hsl-h-input', placeholder: 'H', className: 'value-input' });
    const satInput = createEl('input', { type: 'text', id: 'hsl-s-input', placeholder: 'S', className: 'value-input' });
    this.elements.hslHInput = hueInput;
    this.elements.hslSInput = satInput;
    this.elements.hslInputsContainer.append(hueInput, satInput);
    
    const interpolationTitle = createEl('h3', { className: 'input-label', text: 'Interpolation' });
    interpolationTitle.style.cssText = 'margin-top: 0.25rem; margin-bottom: 0.125rem;';
    
    const interpolationGrid = createEl('div', { className: 'interpolation-grid' });
    interpolationGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem;';

    this.elements.constantButton = createEl('button', { id: 'constant-button', className: 'interpolation-button active' });
    this.elements.linearButton = createEl('button', { id: 'linear-button', className: 'interpolation-button' });
    this.elements.cubicButton = createEl('button', { id: 'cubic-button', className: 'interpolation-button' });

    this.elements.constantButton.innerHTML = this.createConstantButtonIcon();
    this.elements.linearButton.innerHTML = this.createLinearButtonIcon();
    this.elements.cubicButton.innerHTML = this.createCubicButtonIcon();

    interpolationGrid.append(this.elements.constantButton, this.elements.linearButton, this.elements.cubicButton);
    
    inputsWrapper.append(valuesGrid, this.elements.rgbInputsContainer, this.elements.hslInputsContainer, interpolationTitle, interpolationGrid);
    selectedColorPane.append(scTitle, scPreviewContainer, inputsWrapper);
    
    const cmHeader = createEl('h3', { className: 'section-title text-center', text: 'Current Colormap' });
    const cmPreviewContainer = createEl('div', { className: 'preview-container' });
    cmPreviewContainer.append(this.elements.colormapPreviewCanvas);
    
    const buttonContainer = createEl('div', { className: 'button-container' });
    this.elements.reverseButton = createEl('button', { id: 'reverse-button', className: 'reverse-button', text: 'Reverse' });
    this.elements.cycleButton = createEl('button', { id: 'cycle-button', className: 'cycle-button', text: 'Cycle' });
    this.elements.closeButton = createEl('button', { id: 'close-button', className: 'close-button', text: 'Close' });
    this.elements.selectButton = createEl('button', { id: 'select-button', className: 'select-button', text: 'Select' });
    
    const topButtonRow = createEl('div', { className: 'button-row' });
    topButtonRow.append(this.elements.reverseButton, this.elements.cycleButton);
    buttonContainer.append(topButtonRow, this.elements.closeButton, this.elements.selectButton);

    colormapPreviewPane.append(cmHeader, cmPreviewContainer, buttonContainer);

    this.elements.modalOverlay = createEl('div', { id: 'modal-overlay', className: 'modal-overlay hidden' });
    const modalDialog = createEl('div', { id: 'modal-dialog', className: 'modal-dialog' });
    modalDialog.append(createEl('h3', { id: 'modal-title', className: 'modal-title' }), createEl('div', { id: 'modal-input-container', className: 'hidden' }), createEl('div', { id: 'modal-buttons', className: 'modal-buttons' }));
    modalDialog.querySelector('#modal-input-container').append(createEl('input', { type: 'text', id: 'modal-input', className: 'modal-input' }));
    this.elements.modalOverlay.append(modalDialog);
    this.elements.contextMenu = createEl('div', { id: 'context-menu', className: 'context-menu hidden' });

    this.wrapper.className = 'color-editor-layout';
    this.wrapper.append(hsPane, lightnessPane, this.elements.colorsPresetsWrapper, selectedColorPane, alphaPane, this.elements.colormapsPresetsWrapper, colormapPreviewPane, this.elements.modalOverlay, this.elements.contextMenu);
    
    this.createInteractiveCanvas(hsNodesContainer, 'hs');
    this.createInteractiveCanvas(lightnessNodesContainer, 'lightness');
    this.createInteractiveCanvas(alphaNodesContainer, 'alpha');
}

    reverseColormap() {
        if (this.state.points.length === 0) return;
        
        this.markAsDirty();
        
        this.state.points.forEach(point => {
            point.pos = 1 - point.pos;
        });
        
        this.sortPoints();
        
        this.drawAll();
    }

    _constrainToViewport(x, y) {
    const rect = this.wrapper.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = Math.max(0, Math.min(x, viewportWidth - rect.width));
    let finalY = Math.max(0, Math.min(y, viewportHeight - rect.height));

    return { x: finalX, y: finalY };
}

_handleDragStart(e) {
    if (e.target.closest('button, canvas, input, .preset-item')) {
        return;
    }
    e.preventDefault();

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.initialLeft = this.wrapper.offsetLeft;
    this.initialTop = this.wrapper.offsetTop;

    this._boundDragMove = this._handleDragMove.bind(this);
    this._boundDragEnd = this._handleDragEnd.bind(this);

    document.addEventListener('mousemove', this._boundDragMove);
    document.addEventListener('mouseup', this._boundDragEnd, { once: true });
}

_handleDragMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();

    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    
    const newLeft = this.initialLeft + dx;
    const newTop = this.initialTop + dy;

    const constrained = this._constrainToViewport(newLeft, newTop);

    this.wrapper.style.left = `${constrained.x}px`;
    this.wrapper.style.top = `${constrained.y}px`;
}

_handleDragEnd(e) {
    this.isDragging = false;
    document.removeEventListener('mousemove', this._boundDragMove);
}

    setupEventListeners() {
    this.wrapper.addEventListener('mousedown', this._handleDragStart.bind(this));

    this.elements.tabRgbCube.addEventListener('click', () => this.setColorSpace('RGB_CUBE'));
    this.elements.tabHslCone.addEventListener('click', () => this.setColorSpace('HSL_DI_CONE'));

    this.wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const canvas = e.target.closest('.interactive-canvas');
        if (canvas) {
            this.deselectAll();
        }
    });

    document.addEventListener('click', () => this.hideContextMenu());

    const resizeObserver = new ResizeObserver(() => this.setupCanvases());
    resizeObserver.observe(this.wrapper);

    Object.values(this.elements.interactiveCanvases).forEach(canvas => {
        canvas.addEventListener('mouseenter', () => { this.state.isMouseInCanvas = true; });
        canvas.addEventListener('mouseleave', () => { this.state.isMouseInCanvas = false; });
    });

    this.elements.hsNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'hs'));
    this.elements.lightnessNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'lightness'));
    this.elements.alphaNodesContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e, 'alpha'));

    document.addEventListener('keydown', (e) => this.handleKeyDown(e));

    this.elements.lightnessInput.addEventListener('change', (e) => this.handleInputChange(e, 'lightness'));
    this.elements.alphaInput.addEventListener('change', (e) => this.handleInputChange(e, 'alpha'));
    this.elements.positionInput.addEventListener('change', (e) => this.handleInputChange(e, 'position'));

    this.elements.constantButton.addEventListener('click', () => this.setInterpolationMode(0));
    this.elements.linearButton.addEventListener('click', () => this.setInterpolationMode(1));
    this.elements.cubicButton.addEventListener('click', () => this.setInterpolationMode(3));

    const colorChangeHandler = () => this.handleColorInputChange();
    this.elements.rgbRInput.addEventListener('change', colorChangeHandler);
    this.elements.rgbGInput.addEventListener('change', colorChangeHandler);
    this.elements.rgbBInput.addEventListener('change', colorChangeHandler);
    this.elements.hslHInput.addEventListener('change', colorChangeHandler);
    this.elements.hslSInput.addEventListener('change', colorChangeHandler);

    const presetEventHandler = (e) => {
        const target = e.target.closest('.preset-item');
        if (target) {
            if (e.type === 'click') {
                this.handlePresetClick(target);
            } else if (e.type === 'contextmenu' && target.dataset.custom === 'true') {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e, target.dataset.name, target.dataset.type);
            }
        }
    };

    this.elements.colorsPresetsWrapper.addEventListener('click', presetEventHandler);
    this.elements.colorsPresetsWrapper.addEventListener('contextmenu', presetEventHandler);
    this.elements.colormapsPresetsWrapper.addEventListener('click', presetEventHandler);
    this.elements.colormapsPresetsWrapper.addEventListener('contextmenu', presetEventHandler);

    this.elements.reverseButton.addEventListener('click', () => {
        this.reverseColormap();
    });

    this.elements.cycleButton.addEventListener('click', () => {
        this.toggleCycle();
    });

    this.elements.closeButton.addEventListener('click', () => {
        this.hide();
    });

    this.elements.selectButton.addEventListener('click', () => {
        let outputPoints = [];
        const points = this.state.points;
        const n = points.length;

        const formatPoint = (p, posOverride) => {
            const color = this.abstractToRgb(p.hsPos.u, p.hsPos.v, p.lightness);
            const rgb = this.clampColor(color);
            return {
                pos: parseFloat((posOverride !== undefined ? posOverride : p.pos).toFixed(6)),
                alpha: parseFloat(p.alpha.toFixed(4)),
                color: [rgb.r, rgb.g, rgb.b],
                order: p.order
            };
        };

        if (n > 0) {
            const numSegments = this.state.isCyclic ? n : n - 1;
            for (let i = 0; i < numSegments; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % n];
                outputPoints.push(formatPoint(p1));
                const effectiveOrder = Math.max(p1.order, p2.order);

                if (effectiveOrder === 0) {
                    let segmentStartPos = p1.pos;
                    let segmentEndPos = p2.pos;
                    if (this.state.isCyclic && segmentEndPos < segmentStartPos) {
                        segmentEndPos += 1.0;
                    }
                    const transitionPos = segmentStartPos + (segmentEndPos - segmentStartPos) * 0.5;
                    outputPoints.push(formatPoint(p1, this.wrapPositionCyclic(transitionPos - 1e-6)));
                    outputPoints.push(formatPoint(p2, this.wrapPositionCyclic(transitionPos)));
                } else if (effectiveOrder === 3) {
                    const CUBIC_SAMPLES_PER_SEGMENT = 16;
                    const segmentStartPos = p1.pos;
                    let segmentEndPos = p2.pos;
                    if (this.state.isCyclic && segmentEndPos < segmentStartPos) {
                        segmentEndPos += 1.0;
                    }
                    const segmentDuration = segmentEndPos - segmentStartPos;
                    for (let j = 1; j < CUBIC_SAMPLES_PER_SEGMENT; j++) {
                        const tLocal = j / CUBIC_SAMPLES_PER_SEGMENT;
                        const tGlobal = segmentStartPos + tLocal * segmentDuration;
                        const props = this.getInterpolatedPropertiesAt(this.wrapPositionCyclic(tGlobal));
                        if (props) {
                            const color = this.abstractToRgb(props.u, props.v, props.lightness);
                            const rgb = this.clampColor(color);
                            outputPoints.push({
                                pos: parseFloat(this.wrapPositionCyclic(tGlobal).toFixed(6)),
                                alpha: parseFloat(props.alpha.toFixed(4)),
                                color: [rgb.r, rgb.g, rgb.b],
                                order: props.order
                            });
                        }
                    }
                }
            }
            if (!this.state.isCyclic) {
                outputPoints.push(formatPoint(points[n - 1]));
            }
        }

        const posMap = new Map();
        outputPoints.forEach(p => posMap.set(p.pos, p));
        let finalPoints = Array.from(posMap.values()).sort((a,b) => a.pos - b.pos);
        
        if (this.state.isCyclic && finalPoints.length > 0) {
            const firstPoint = finalPoints[0];
            const lastPoint = finalPoints[finalPoints.length - 1];
            if (lastPoint.pos < 1.0 - 1e-6) {
                finalPoints.push({ ...firstPoint, pos: 1.0 });
            }
        }

        const originalControlPoints = this.state.points.map(p => {
            const color = this.abstractToRgb(p.hsPos.u, p.hsPos.v, p.lightness);
            const rgb = this.clampColor(color);
            return {
                pos: parseFloat(p.pos.toFixed(4)),
                alpha: parseFloat(p.alpha.toFixed(4)),
                color: [rgb.r, rgb.g, rgb.b],
                order: p.order
            };
        });

        const output = {
            id: this.state.colormapId,
            points: finalPoints,
            controlPoints: originalControlPoints,
            isCyclic: this.state.isCyclic
        };

        const selectEvent = new CustomEvent('select', {
            detail: output,
            bubbles: true,
            cancelable: true
        });
        this.wrapper.dispatchEvent(selectEvent);
    });
}

setInterpolationMode(mode) {
    if (this.state.selectedPointIds.size === 0) return;
    
    this.markAsDirty();
    
    this.state.points.forEach(point => {
        if (this.state.selectedPointIds.has(point.id)) {
            point.order = mode;
        }
    });
    
    this.elements.constantButton.classList.toggle('active', mode === 0);
    this.elements.linearButton.classList.toggle('active', mode === 1);
    this.elements.cubicButton.classList.toggle('active', mode === 3);
    
    this.drawAll();
}
    
        showContextMenu(e, name, type) {
            this.hideContextMenu();
            const menu = this.elements.contextMenu;
            menu.innerHTML = '';
    
            const actions = {'Rename': () => this.handlePresetAction('rename', name, type), 'Delete': () => this.handlePresetAction('delete', name, type)};
    
            for(const [label, action] of Object.entries(actions)) {
                const item = document.createElement('button');
                item.className = 'context-menu-item';
                item.textContent = label;
                item.onclick = action;
                menu.appendChild(item);
            }
    
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            menu.classList.remove('hidden');
        }
    
        hideContextMenu() {
            this.elements.contextMenu.classList.add('hidden');
        }
    
        async handlePresetAction(action, name, type) {
            this.hideContextMenu();
            if (action === 'delete') {
                const confirm = await this.showPrompt(`Delete "${name}"?`, ['Delete', 'Cancel']);
                if (confirm === 'Delete') {
                    if (type === 'custom_colors') delete this.customColors[name];
                    if (type === 'custom_colormaps') delete this.customColormaps[name];
                    this.saveCustomPresets(type);
                    this.populatePresets();
                }
            } else if (action === 'rename') {
                const newName = await this.showPrompt(`Rename "${name}"`, ['Rename', 'Cancel'], { value: name });
                if (newName && newName !== name) {
                    const presetList = type === 'custom_colors' ? this.customColors : this.customColormaps;
                    if (presetList[newName]) {
                        this.showPrompt(`"${newName}" already exists.`, ['OK']);
                        return;
                    }
                    presetList[newName] = presetList[name];
                    delete presetList[name];
                    this.saveCustomPresets(type);
                    this.populatePresets();
                }
            }
        }
    
    async promptAndSaveNewPreset(type, defaultName = '') {
        const newName = await this.showPrompt('Save as:', ['Save', 'Cancel'], { placeholder: 'Enter a name', value: defaultName });
        if (!newName) return false;

        if (type === 'custom_colors') {
            const lastPoint = this.getLastSelectedPoint();
            if(!lastPoint) return false;
            const color = this.abstractToRgb(lastPoint.hsPos.u, lastPoint.hsPos.v, lastPoint.lightness);
            const rgb = this.clampColor(color);
            this.customColors[newName] = { rgb: [rgb.r, rgb.g, rgb.b], alpha: lastPoint.alpha };
        } else {
            const points = this.state.points.map(p => {
                const color = this.abstractToRgb(p.hsPos.u, p.hsPos.v, p.lightness);
                const rgb = this.clampColor(color);
                return { pos: p.pos, alpha: p.alpha, color: [rgb.r, rgb.g, rgb.b], order: p.order };
            });
            this.customColormaps[newName] = { 
                points,
                isCyclic: this.state.isCyclic
            };
            this.state.loadedColormapName = newName;
            this.state.loadedColormapType = type;
            this.setDirty(false);
        }

        this.saveCustomPresets(type);
        this.populatePresets();
        return true;
    }
    
        markAsDirty() {
            this.setDirty(true);
            this.saveState();
        }
    
        populatePresets() {
            this.elements.colorsPresetsWrapper.innerHTML = '';
            this.elements.colormapsPresetsWrapper.innerHTML = '';
    
            const createCategory = (title, onAdd) => {
                const header = document.createElement('div');
                header.className = 'preset-category-header';
                const titleEl = document.createElement('div');
                titleEl.className = 'preset-category-title';
                titleEl.textContent = title;
                const addBtn = document.createElement('button');
                addBtn.className = 'add-preset-btn';
                addBtn.textContent = '+';
                addBtn.onclick = onAdd;
                header.appendChild(titleEl);
                header.appendChild(addBtn);
                return header;
            };
    
            const renderItems = (container, items, type, isCustom) => {
                Object.keys(items).sort().forEach(name => {
                    const item = document.createElement('div');
                    item.className = 'preset-item';
                    item.dataset.name = name;
                    item.dataset.type = type;
                    item.dataset.custom = isCustom;
    
                    const icon = document.createElement('canvas');
                    icon.className = 'preset-icon';
    
                    if (type.includes('colormap')) {
                        icon.width = 64;
                        icon.height = 16;
                    } else {
                        icon.width = 16;
                        icon.height = 16;
                    }
    
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = name;
    
                    item.appendChild(icon);
                    item.appendChild(nameSpan);
                    container.appendChild(item);
    
                    // This is the corrected condition
                    if (type === 'named_colors' || type === 'custom_colors') {
                        const colorData = items[name];
                        const rgb = isCustom ? colorData.rgb : colorData;
                        this.drawColorIcon(icon, rgb);
                    } else {
                        this.drawColormapIcon(icon, items[name].points, this.namedColors, this.customColors);
                    }
                });
            };
    
            const colorsItemsContainer = document.createElement('div');
            colorsItemsContainer.className = 'preset-items-container';
            this.elements.colorsPresetsWrapper.appendChild(createCategory('Colors', () => this.promptAndSaveNewPreset('custom_colors')));
            this.elements.colorsPresetsWrapper.appendChild(colorsItemsContainer);
            renderItems(colorsItemsContainer, this.namedColors, 'named_colors', false);
            renderItems(colorsItemsContainer, this.customColors, 'custom_colors', true);
    
            const colormapsItemsContainer = document.createElement('div');
            colormapsItemsContainer.className = 'preset-items-container';
            this.elements.colormapsPresetsWrapper.appendChild(createCategory('Colormaps', () => this.promptAndSaveNewPreset('custom_colormaps')));
            this.elements.colormapsPresetsWrapper.appendChild(colormapsItemsContainer);
            renderItems(colormapsItemsContainer, this.namedColormaps, 'named_colormaps', false);
            renderItems(colormapsItemsContainer, this.customColormaps, 'custom_colormaps', true);
        }
    
        drawColormapIcon(canvas, pointsData, namedColors, customColors) {
            // Step 1: Convert the raw icon data into the full, complex point objects
            // that the main rendering engine expects. This process mirrors the working
            // logic from the `loadColormap` function.
            const tempPoints = pointsData.map(p => {
                let rgbArray = [0, 0, 0];
                if (typeof p.color === 'string') {
                    rgbArray = namedColors[p.color] || (customColors[p.color] ? customColors[p.color].rgb : [0, 0, 0]);
                } else if (Array.isArray(p.color)) {
                    rgbArray = p.color;
                }
    
                const { hsPos, lightness } = this.convertRgbToCurrentColorspace(rgbArray[0] / 255, rgbArray[1] / 255, rgbArray[2] / 255);
                
                return {
                    id: Math.random(),
                    hsPos: hsPos,
                    originalHsPos: { ...hsPos },
                    lightness: lightness,
                    alpha: p.alpha ?? 1.0,
                    pos: p.pos,
                    order: 1,
                };
            }).sort((a, b) => a.pos - b.pos);
    
            // Step 2: Temporarily replace the main editor's state with these new points.
            const originalPoints = this.state.points;
            this.state.points = tempPoints;
    
            // Step 3: Execute the exact same drawing logic as the main preview,
            // but directed at the small icon canvas.
            const ctx = canvas.getContext('2d');
            const { width, height } = canvas;
            this.drawCheckerboard(ctx);
    
            if (this.state.points.length > 0) {
                for (let i = 0; i < width; i++) {
                    const t = i / (width - 1);
                    const props = this.getInterpolatedPropertiesAt(t);
                    if (!props) continue;
    
                    const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
                    const color = this.abstractToRgb(clamped.u, clamped.v, props.lightness);
                    const { r, g, b } = this.clampColor(color);
    
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${props.alpha})`;
                    ctx.fillRect(i, 0, 1, height);
                }
            }
    
            // Step 4: Crucially, restore the editor's original state.
            this.state.points = originalPoints;
        }
    
    
        showPrompt(title, buttons, inputConfig = null) {
    return new Promise(resolve => {
        const { modalOverlay, modalTitle, modalInputContainer, modalInput, modalButtons } = this.elements;

        // Hide all KaTeX labels when showing modal
        const allTickLabels = document.querySelectorAll('[data-tick-canvas]');
        allTickLabels.forEach(label => label.style.display = 'none');

        modalTitle.textContent = title;
        modalButtons.innerHTML = '';

        if (inputConfig) {
            modalInput.value = inputConfig.value || '';
            modalInput.placeholder = inputConfig.placeholder || '';
            modalInputContainer.classList.remove('hidden');
        } else {
            modalInputContainer.classList.add('hidden');
        }

        buttons.forEach(btnLabel => {
            const btn = document.createElement('button');
            btn.className = `modal-button ${btnLabel === 'Save' || btnLabel === 'Delete' || btnLabel === 'Rename' ? 'modal-button-primary' : 'modal-button-secondary'}`;
            btn.textContent = btnLabel;
            btn.onclick = () => {
                modalOverlay.classList.add('hidden');
                
                // Restore KaTeX labels when hiding modal
                allTickLabels.forEach(label => label.style.display = '');
                
                resolve(inputConfig ? modalInput.value : btnLabel);
            };
            modalButtons.appendChild(btn);
        });

        modalOverlay.classList.remove('hidden');
        if (inputConfig) modalInput.focus();
    });
}

    restoreOriginalPositions() {
        for (const originalPoint of this.state.originalPositions) {
            const currentPoint = this.state.points.find(p => p.id === originalPoint.id);
            if (currentPoint) {
                currentPoint.pos = originalPoint.pos;
            }
        }
    }

    toggleCycle() {
    if (this.state.points.length === 0) return;

    if (!this.state.isCyclic) {
        const hasPointAtZero = this.state.points.some(p => Math.abs(p.pos) < 1e-6);
        const hasPointAtOne = this.state.points.some(p => Math.abs(p.pos - 1) < 1e-6);
        
        if (hasPointAtZero && hasPointAtOne) {
            this.state.originalPositions = this.state.points.map(p => ({ id: p.id, pos: p.pos }));
            const n = this.state.points.length;
            const scaleFactor = 1 - (1 / n);
            this.state.points.forEach(point => {
                point.pos *= scaleFactor;
            });
        } else {
            this.state.originalPositions = null;
        }
        this.state.isCyclic = true;
        this.state.cyclicStateWhenEnabled = this.createSnapshot();
    } else {
        if (this.state.originalPositions && !this.state.isDirty) {
            this.restoreOriginalPositions();
            this.state.originalPositions = null;
            this.state.isCyclic = false;
        } else {
            this.state.originalPositions = null;
            this.state.isCyclic = false;
        }
        this.state.cyclicStateWhenEnabled = null;
    }
    
    // Update button text based on current state (no class changes)
    this.elements.cycleButton.textContent = this.state.isCyclic ? 'Uncycle' : 'Cycle';
    this.drawAll();
}
    
        drawColorIcon(canvas, rgb) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    
        
    
        createPointFromRgb(r, g, b, alpha, pos, order) {
            const { hsPos, lightness } = this.convertRgbToCurrentColorspace(r, g, b);
            return {
                id: Date.now() + Math.random(),
                hsPos,
                originalHsPos: { ...hsPos },
                lightness,
                alpha,
                pos,
                order,
            };
        }
    
        convertRgbToCurrentColorspace(r, g, b) {
            if (this.state.colorSpace === 'RGB_CUBE') {
                return {
                    hsPos: this.rgbCubeRgbToAbstract({ r, g, b }),
                    lightness: (r + g + b) / 3
                };
            } else {
                const hsl = this.rgbToHsl(r, g, b);
                return {
                    hsPos: this.rgbToHslDiConeAbstract(r, g, b),
                    lightness: hsl.l
                };
            }
        }
    
        sortPoints() {
            this.state.points.sort((a, b) => a.pos - b.pos || a.id - b.id);
        }
    
        deselectAll() {
   if (this.state.selectedPointIds.size > 0) {
       this.state.selectedPointIds.clear();
       this.state.lastSelectedPointId = null;
       this.drawAll();
   }
}
    
        // Replace the setupCanvases method in your ColormapSelector class with this fixed version:

setupCanvases() {
    const lightnessInteractiveCanvas = this.elements.interactiveCanvases['lightness'];
    const alphaInteractiveCanvas = this.elements.interactiveCanvases['alpha'];

    const otherCanvases = [
        { c: this.elements.lightnessBgCanvas, container: this.elements.lightnessBgCanvas.parentElement },
        { c: lightnessInteractiveCanvas, container: lightnessInteractiveCanvas.parentElement },
        { c: this.elements.alphaBgCanvas, container: this.elements.alphaBgCanvas.parentElement },
        { c: alphaInteractiveCanvas, container: alphaInteractiveCanvas.parentElement },
        { c: this.elements.colormapPreviewCanvas, container: this.elements.colormapPreviewCanvas.parentElement },
        { c: this.elements.selectedColorPreviewCanvas, container: this.elements.selectedColorPreviewCanvas.parentElement }
    ];

    otherCanvases.forEach(item => {
        if (!item.c || !item.container) return;
        const { clientWidth, clientHeight } = item.container;
        if (item.c.width !== clientWidth || item.c.height !== clientHeight) {
            item.c.width = clientWidth;
            item.c.height = clientHeight;
        }
    });

    // HS Canvas - Make it fill the entire container like other canvases
    const hsBgCanvas = this.elements.hsBgCanvas;
    const hsInteractiveCanvas = this.elements.interactiveCanvases['hs'];
    const hsContainer = hsBgCanvas.parentElement;

    const containerWidth = hsContainer.clientWidth;
    const containerHeight = hsContainer.clientHeight;

    // Set HS canvases to fill the entire container (no square constraint)
    [hsBgCanvas, hsInteractiveCanvas].forEach(canvas => {
        if (!canvas) return;
        canvas.width = containerWidth;
        canvas.height = containerHeight;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${containerHeight}px`;
        canvas.style.left = '0px';
        canvas.style.top = '0px';
    });

    this.drawAll();
}
    
        setColorSpace(newSpace) {
            const oldSpace = this.state.colorSpace;
            if (newSpace === oldSpace) return;
    
            this.markAsDirty();
    
            this.state.points.forEach(point => {
                let colorRgb;
                if (oldSpace === 'RGB_CUBE') {
                    colorRgb = this.rgbCubeAbstractToRgb(point.hsPos.u, point.hsPos.v, point.lightness);
                } else {
                    colorRgb = this.hslDiConeAbstractToRgb(point.hsPos.u, point.hsPos.v, point.lightness);
                }
    
                let newHsPos, newLightness;
                if (newSpace === 'RGB_CUBE') {
                    newHsPos = this.rgbCubeRgbToAbstract(colorRgb);
                    newLightness = (colorRgb.r + colorRgb.g + colorRgb.b) / 3;
                } else {
                    const hsl = this.rgbToHsl(colorRgb.r, colorRgb.g, colorRgb.b);
                    newHsPos = this.rgbToHslDiConeAbstract(colorRgb.r, colorRgb.g, colorRgb.b);
                    newLightness = hsl.l;
                }
    
                point.hsPos = newHsPos;
                point.originalHsPos = { ...newHsPos };
                point.lightness = newLightness;
            });
    
            const lastSelectedPoint = this.getLastSelectedPoint();
            if (lastSelectedPoint) {
                this.state.viewLightness = lastSelectedPoint.lightness;
                this.state.viewAlpha = lastSelectedPoint.alpha;
            }
    
            this.state.colorSpace = newSpace;
            this.updateTabs();
            this.drawAll();
        }
    
        handleMouseDown(e, type) {
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
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

    const timeSinceLastClick = now - this.lastClickTime;
    if (timeSinceLastClick < C.DBL_CLICK_SPEED && hitPoint && hitPoint.id === this.lastClickTarget) {
        this.clickCount++;
    } else {
        this.clickCount = 1;
    }
    this.lastClickTime = now;
    this.lastClickTarget = hitPoint ? hitPoint.id : null;

    if (hitPoint) {
        this.state.viewLightness = hitPoint.lightness;
        this.state.viewAlpha = hitPoint.alpha;
        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const isShiftPressed = e.shiftKey;
        if (!this.state.selectedPointIds.has(hitPoint.id) && !isCtrlPressed && !isShiftPressed) {
            this.state.selectedPointIds.clear();
            this.state.selectedPointIds.add(hitPoint.id);
            this.state.lastSelectedPointId = hitPoint.id;
        }
    }

    this.state.activeDrag.type = type;
    this.state.activeDrag.element = canvas;
    this.state.activeDrag.pointId = hitPoint ? hitPoint.id : null;

    if (hitPoint) {
        const offsets = new Map();
        if (type === 'hs') {
            this.state.activeDrag.startX = x;
            this.state.activeDrag.startY = y;
            this.state.activeDrag.initialPointPositions = new Map();
            const { scale, offsetX, offsetY } = this.state.transform;
            this.state.points.forEach(p => {
                if (this.state.selectedPointIds.has(p.id)) {
                    const p_x = p.hsPos.u * scale + offsetX;
                    const p_y = p.hsPos.v * scale + offsetY;
                    this.state.activeDrag.initialPointPositions.set(p.id, { x: p_x, y: p_y });
                }
            });
        } else {
            this.state.points.forEach(p => {
                if (this.state.selectedPointIds.has(p.id)) {
                    offsets.set(p.id, {
                        lightness: p.lightness - hitPoint.lightness,
                        alpha: p.alpha - hitPoint.alpha,
                        pos: p.pos - hitPoint.pos
                    });
                }
            });
            this.state.activeDrag.offsets = offsets;
        }
    } else if (hitLine) {
        this.state.activeDrag.type = type + '-line';
    } else {
        this.state.selectedPointIds.clear();
        this.state.lastSelectedPointId = null;
    }

    this.drawAll();

    const onMove = (moveEvent) => {
        const currentX = (moveEvent.clientX - rect.left) * scaleX;
        const currentY = (moveEvent.clientY - rect.top) * scaleY;
        const dist = Math.sqrt((currentX - startPos.x)**2 + (currentY - startPos.y)**2);
        if (!hasDragged && dist > C.DRAG_THRESHOLD) {
            hasDragged = true;
            if (hitPoint) {
                this.markAsDirty();
            }
        }
        if (this.state.activeDrag.type) {
            this.handleMouseMove(moveEvent);
        }
    };

    const onEnd = (upEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        if (!hasDragged) {
            this.handleClick(x, y, type, hitPoint, upEvent);
        }
        this.state.activeDrag = { type: null, element: null, pointId: null, offsets: null };
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
}
    
        handleClick(x, y, type, hitPoint, e) {
  const { shiftKey, ctrlKey, metaKey } = e;
  const isCtrlPressed = ctrlKey || metaKey;

  if (hitPoint) {
      const { selectedPointIds } = this.state;
      const pointId = hitPoint.id;

      if (this.clickCount === 3) {
          this.state.points.forEach(p => selectedPointIds.add(p.id));
          this.state.lastSelectedPointId = pointId; // Keep the clicked point as the last selected
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
                  this.state.lastSelectedPointId = selectedPointIds.size > 0 ? Array.from(selectedPointIds)[0] : null;
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
  } else if (type === 'hs') {
      this.createNewPointHS(x, y);
  } else if (type === 'lightness' || type === 'alpha') {
      const canvas = this.elements.interactiveCanvases[type];
      const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
      const validHeight = canvas.height - 2 * glyphMargin;
      const validBottom = canvas.height - glyphMargin;
      
      const normalizedY = (validBottom - y) / validHeight;
      const value = Math.max(0, Math.min(1, normalizedY));
      
      if (type === 'lightness') {
          this.state.viewLightness = value;
      } else {
          this.state.viewAlpha = value;
      }
  }
  this.drawAll();
}

    findHitPointHS(x, y) {
        const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
        const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
        const totalMargin = glyphMargin + tickMargin;
        
        const clipX = totalMargin;
        const clipY = totalMargin;
        const clipWidth = this.elements.hsBgCanvas.width - totalMargin - glyphMargin;
        const clipHeight = this.elements.hsBgCanvas.height - totalMargin - glyphMargin;
        
        // Only check points that are within the valid drawing area
        for (const point of this.state.points) {
            const px = point.hsPos.u * this.state.transform.scale + this.state.transform.offsetX;
            const py = point.hsPos.v * this.state.transform.scale + this.state.transform.offsetY;
            
            // Only consider points within the clipped area (with some tolerance for edge points)
            if (px >= clipX - C.NODE_RADIUS && px <= clipX + clipWidth + C.NODE_RADIUS &&
                py >= clipY - C.NODE_RADIUS && py <= clipY + clipHeight + C.NODE_RADIUS) {
                
                const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
                if (distance <= C.NODE_HIT_RADIUS) {
                    return point;
                }
            }
        }
        return null;
    }

        handleInputChange(e, type) {
    const value = e.target.value;
    if (this.state.selectedPointIds.size === 0) return;
    let success = false;
    if (type === 'lightness' || type === 'alpha') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
            this.markAsDirty();
            this.state.points.forEach(p => {
                if (this.state.selectedPointIds.has(p.id)) {
                    p[type] = numValue;
                    if (type === 'lightness') {
                        this.constrainPointToValidArea(p);
                    }
                }
            });
            success = true;
        }
    } else if (type === 'position') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
            this.markAsDirty();
            this.state.points.forEach(p => {
                if (this.state.selectedPointIds.has(p.id)) {
                    p.pos = numValue;
                }
            });
            this.sortPoints();
            success = true;
        }
    }
    if (success) {
        const lastSelectedPoint = this.getLastSelectedPoint();
        if (lastSelectedPoint) {
            this.state.viewLightness = lastSelectedPoint.lightness;
            this.state.viewAlpha = lastSelectedPoint.alpha;
        }
    }
    this.drawAll();
}
    
        handleColorInputChange() {
    if (this.state.selectedPointIds.size === 0) return;
    let r, g, b, h, s, l;
    let success = false;
    if (this.state.colorSpace === 'RGB_CUBE') {
        r = parseInt(this.elements.rgbRInput.value, 10);
        g = parseInt(this.elements.rgbGInput.value, 10);
        b = parseInt(this.elements.rgbBInput.value, 10);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return;
        this.markAsDirty();
        r = Math.max(0, Math.min(255, r)) / 255;
        g = Math.max(0, Math.min(255, g)) / 255;
        b = Math.max(0, Math.min(255, b)) / 255;
        const newHsPos = this.rgbCubeRgbToAbstract({ r, g, b });
        const newLightness = (r + g + b) / 3;
        this.state.points.forEach(p => {
            if (this.state.selectedPointIds.has(p.id)) {
                p.hsPos = { ...newHsPos };
                p.originalHsPos = { ...newHsPos };
                p.lightness = newLightness;
            }
        });
        success = true;
    } else {
        h = parseFloat(this.elements.hslHInput.value);
        s = parseFloat(this.elements.hslSInput.value);
        l = this.state.viewLightness; // Use existing lightness from above
        if (isNaN(h) || isNaN(s)) return;
        this.markAsDirty();
        h = Math.max(0, Math.min(1, h));
        s = Math.max(0, Math.min(1, s));
        const rgb = this.hslToRgb(h, s, l);
        const newHsPos = this.rgbToHslDiConeAbstract(rgb.r, rgb.g, rgb.b);
        this.state.points.forEach(p => {
            if (this.state.selectedPointIds.has(p.id)) {
                p.hsPos = { ...newHsPos };
                p.originalHsPos = { ...newHsPos };
                // Keep existing lightness, don't change it
            }
        });
        success = true;
    }
    if (success) {
        const lastSelectedPoint = this.getLastSelectedPoint();
        if (lastSelectedPoint) {
            this.state.viewLightness = lastSelectedPoint.lightness;
            this.state.viewAlpha = lastSelectedPoint.alpha;
        }
    }
    this.drawAll();
}
    
        createInteractiveCanvas(container, type) {
            const canvas = document.createElement('canvas');
            canvas.className = `interactive-canvas ${type}-interactive`;
            canvas.dataset.type = type;
            container.appendChild(canvas);
            this.elements.interactiveCanvases[type] = canvas;
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
    
        rgbCubeRgbToAbstract(rgb) {
            const u = (rgb.r - rgb.g) / Math.sqrt(2);
            const v = (rgb.r + rgb.g - 2 * rgb.b) / Math.sqrt(6);
            return { u, v };
        }
    
        rgbToHslDiConeAbstract(r, g, b) {
            const hsl = this.rgbToHsl(r, g, b);
            const radiusAtL = 1 - Math.abs(2 * hsl.l - 1);
            const s_abstract = hsl.s * radiusAtL;
            const angle = hsl.h * 2 * Math.PI;
            const u = s_abstract * Math.cos(angle);
            const v = s_abstract * Math.sin(angle);
            return { u, v };
        }
    
        hslDiConeAbstractToRgb(u, v, lightness) {
            const h = (Math.atan2(v, u) / (2 * Math.PI) + 1) % 1;
            const s_abstract = Math.sqrt(u * u + v * v);
            const l = lightness;
            const radiusAtL = 1 - Math.abs(2 * l - 1);
    
            if (radiusAtL < 1e-9) {
                return { r: l, g: l, b: l };
            }
    
            const s_real = s_abstract / radiusAtL;
            return this.hslToRgb(h, s_real, l);
        }
    
        updateTabs() {
            this.elements.tabRgbCube.classList.toggle('active', this.state.colorSpace === 'RGB_CUBE');
            this.elements.tabHslCone.classList.toggle('active', this.state.colorSpace === 'HSL_DI_CONE');
        }
    
        handleKeyDown(e) {
   const activeEl = document.activeElement;
   const isEditingText = activeEl && activeEl.tagName === 'INPUT';
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

   if (isEditingText) {
       if (e.key === 'Escape') {
           e.preventDefault();
           activeEl.blur();
       }
       return;
   }

   if (isCtrl && e.key === 'a') {
       e.preventDefault();
       if (this.state.isMouseInCanvas) {
           this.state.selectedPointIds.clear();
           this.state.points.forEach(p => this.state.selectedPointIds.add(p.id));
           if (this.state.points.length > 0) {
               this.state.lastSelectedPointId = this.state.points[this.state.points.length - 1].id;
           }
           this.drawAll();
       }
       return;
   }

   if (e.key === 'Escape') {
       e.preventDefault();
       this.deselectAll();
       return;
   }

   if (e.key === 'Delete' || e.key === 'Backspace') {
       if (this.state.selectedPointIds.size > 0) {
           this.markAsDirty();
           this.state.points = this.state.points.filter(point => !this.state.selectedPointIds.has(point.id));
           this.state.selectedPointIds.clear();
           this.state.lastSelectedPointId = null;
           this.drawAll();
       }
   }
}

        findSnapPosition(currentY, canvasHeight, sliderType, ignorePointId = null) {
    let snappedY = currentY;
    let minDistance = C.SNAP_DISTANCE + 1;
    
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const validHeight = canvasHeight - totalMargin - glyphMargin;
    const validBottom = canvasHeight - glyphMargin;

    this.state.points.forEach(point => {
        if (point.id === ignorePointId) {
            return;
        }

        const pointY = validBottom - point[sliderType] * validHeight;
        const distance = Math.abs(currentY - pointY);

        if (distance < C.SNAP_DISTANCE && distance < minDistance) {
            snappedY = pointY;
            minDistance = distance;
        }
    });

    return snappedY;
}
    
        getLastSelectedPoint() {
   if (!this.state.lastSelectedPointId || !this.state.selectedPointIds.has(this.state.lastSelectedPointId)) {
       return null;
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

        drawHSSlice() {
    const { viewLightness, viewAlpha, colorSpace } = this.state;
    const width = this.elements.hsBgCanvas.width;
    const height = this.elements.hsBgCanvas.height;

    if (width === 0 || height === 0) return;

    const ctx = this.elements.hsBgCanvas.getContext('2d');
    
    // Clear with the background color using the constant
    ctx.fillStyle = C.COLOR_PANEL_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    // Use consistent margin calculation
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    // Calculate available space after margins
    const availableWidth = width - totalMargin - glyphMargin;
    const availableHeight = height - totalMargin - glyphMargin;
    
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const scale = (colorSpace === 'RGB_CUBE')
        ? Math.min(availableWidth, availableHeight) / (Math.sqrt(2/3) * 2) * C.HS_PLANE_SCALE_FACTOR
        : Math.min(availableWidth, availableHeight) / 2 * C.HS_PLANE_SCALE_FACTOR;

    this.state.transform.scale = scale;
    this.state.transform.offsetX = width / 2;
    this.state.transform.offsetY = height / 2;

    // Draw checkerboard only in the valid area
    const clipX = totalMargin;
    const clipY = totalMargin;
    const clipWidth = availableWidth;
    const clipHeight = availableHeight;
    
    // Draw checkerboard that perfectly fits the valid area
    const idealSquareSize = C.CHECKERBOARD_SIZE;
    const squaresW = Math.round(clipWidth / idealSquareSize);
    const squaresH = Math.round(clipHeight / idealSquareSize);
    const actualSquareW = clipWidth / squaresW;
    const actualSquareH = clipHeight / squaresH;

    for (let i = 0; i < squaresH; i++) {
        for (let j = 0; j < squaresW; j++) {
            const x = clipX + j * actualSquareW;
            const y = clipY + i * actualSquareH;
            
            if ((i + j) % 2 === 0) {
                ctx.fillStyle = C.COLOR_CHECKER_LIGHT;
            } else {
                ctx.fillStyle = C.COLOR_CHECKER_DARK;
            }
            
            ctx.fillRect(x, y, actualSquareW, actualSquareH);
        }
    }

    // Special handling for HSL Di-Cone at lightness extremes
    if (colorSpace === 'HSL_DI_CONE') {
        const radiusAtL = 1 - Math.abs(2 * viewLightness - 1);
        if (radiusAtL < 0.01) {
            // At lightness 0 or 1, draw a single pixel at center
            const centerX = width / 2;
            const centerY = height / 2;
            const grayValue = viewLightness < 0.5 ? 0 : 255;
            
            ctx.fillStyle = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${viewAlpha})`;
            ctx.fillRect(Math.floor(centerX), Math.floor(centerY), 1, 1);
            return;
        }
    }

    // Create imageData only for the valid area
    const imageData = ctx.createImageData(clipWidth, clipHeight);
    const data = imageData.data;

    for (let j = 0; j < clipHeight; j++) {
        for (let i = 0; i < clipWidth; i++) {
            const canvasX = clipX + i;
            const canvasY = clipY + j;
            const au = (canvasX - this.state.transform.offsetX) / this.state.transform.scale;
            const av = (canvasY - this.state.transform.offsetY) / this.state.transform.scale;
            const {r, g, b} = this.abstractToRgb(au, av, viewLightness);
            const index = (j * clipWidth + i) * 4;

            if (this.isValidColor(r, g, b)) {
                data[index] = Math.round(r * 255);
                data[index + 1] = Math.round(g * 255);
                data[index + 2] = Math.round(b * 255);
                data[index + 3] = 255;
            }
        }
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = clipWidth;
    tempCanvas.height = clipHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    ctx.globalAlpha = viewAlpha;
    ctx.drawImage(tempCanvas, clipX, clipY);
    ctx.globalAlpha = 1.0;
}

    

    evaluateCubicSpline(segmentIndex, tLocal) {
        const points = this.state.points;
        const n = points.length;
        
        if (segmentIndex < 0 || segmentIndex >= n) return null;
        
        let p0, p1, p2, p3;
        
        if (this.state.isCyclic) {
            // In cyclic mode, wrap around for all segments
            const getPoint = (index) => {
                const wrappedIndex = ((index % n) + n) % n;
                return points[wrappedIndex];
            };
            
            if (segmentIndex === n - 1) {
                // Last segment wraps to first
                p0 = getPoint(segmentIndex - 1);
                p1 = getPoint(segmentIndex);
                p2 = getPoint(0);  // first point
                p3 = getPoint(1);  // second point
            } else {
                // Normal segments but with cyclic wrapping for control points
                p0 = getPoint(segmentIndex - 1);
                p1 = getPoint(segmentIndex);
                p2 = getPoint(segmentIndex + 1);
                p3 = getPoint(segmentIndex + 2);
            }
        } else {
            // Non-cyclic mode (original logic)
            p1 = points[segmentIndex];
            p2 = points[segmentIndex + 1];
            p0 = segmentIndex > 0 ? points[segmentIndex - 1] : points[segmentIndex];
            p3 = segmentIndex + 2 < n ? points[segmentIndex + 2] : points[segmentIndex + 1];
        }
        
        const t = tLocal;
        const t2 = t * t;
        const t3 = t2 * t;
        
        const interpolate = (v0, v1, v2, v3) => {
            return 0.5 * ((2 * v1) + 
                         (-v0 + v2) * t + 
                         (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + 
                         (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
        };
        
        return {
            u: interpolate(p0.hsPos.u, p1.hsPos.u, p2.hsPos.u, p3.hsPos.u),
            v: interpolate(p0.hsPos.v, p1.hsPos.v, p2.hsPos.v, p3.hsPos.v),
            lightness: interpolate(p0.lightness, p1.lightness, p2.lightness, p3.lightness),
            alpha: interpolate(p0.alpha, p1.alpha, p2.alpha, p3.alpha),
            order: 2
        };
    }

        isValidColor(r, g, b) {
            return r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001;
        }
    
        drawSliderBackgrounds() {
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2); // Half tile width extra margin
    const totalMargin = glyphMargin + tickMargin;
    
    // Lightness background
    const bCtx = this.elements.lightnessBgCanvas.getContext('2d');
    const bCanvas = this.elements.lightnessBgCanvas;
    
    // Fill entire canvas with correct background color
    bCtx.fillStyle = C.COLOR_PANEL_BACKGROUND;
    bCtx.fillRect(0, 0, bCanvas.width, bCanvas.height);
    
    // Create gradient only in the valid area (with extra margins for ticks)
    const validLeft = totalMargin;
    const validRight = bCanvas.width - glyphMargin;
    const validTop = totalMargin;
    const validBottom = bCanvas.height - glyphMargin;
    const validWidth = validRight - validLeft;
    const validHeight = validBottom - validTop;
    
    if (validHeight > 0 && validWidth > 0) {
        const bGrad = bCtx.createLinearGradient(0, validTop, 0, validBottom);
        bGrad.addColorStop(0, 'white');
        bGrad.addColorStop(1, 'black');
        bCtx.fillStyle = bGrad;
        bCtx.fillRect(validLeft, validTop, validWidth, validHeight);
    }

    // Alpha background
    const aCtx = this.elements.alphaBgCanvas.getContext('2d');
    const aCanvas = this.elements.alphaBgCanvas;
    
    // Fill entire canvas with correct background color
    aCtx.fillStyle = C.COLOR_PANEL_BACKGROUND;
    aCtx.fillRect(0, 0, aCanvas.width, aCanvas.height);
    
    // Draw checkerboard and gradient only in the valid area (with extra margins for ticks)
    const aValidLeft = totalMargin;
    const aValidRight = aCanvas.width - glyphMargin;
    const aValidTop = totalMargin;
    const aValidBottom = aCanvas.height - glyphMargin;
    const aValidWidth = aValidRight - aValidLeft;
    const aValidHeight = aValidBottom - aValidTop;
    
    if (aValidHeight > 0 && aValidWidth > 0) {
        // Draw checkerboard that perfectly fits the valid area, aligned from bottom
        const idealSquareSize = C.CHECKERBOARD_SIZE;
        const squaresW = Math.round(aValidWidth / idealSquareSize);
        const squaresH = Math.ceil(aValidHeight / idealSquareSize);
        const actualSquareW = aValidWidth / squaresW;
        const actualSquareH = idealSquareSize;
        
        // Start from bottom and work up
        const startY = aValidBottom - (squaresH * actualSquareH);
        
        for (let i = 0; i < squaresH; i++) {
            for (let j = 0; j < squaresW; j++) {
                const x = aValidLeft + j * actualSquareW;
                const y = startY + i * actualSquareH;
                
                // Only draw if within valid area
                if (y < aValidBottom && y + actualSquareH > aValidTop) {
                    if ((i + j) % 2 === 0) {
                        aCtx.fillStyle = C.COLOR_CHECKER_LIGHT;
                    } else {
                        aCtx.fillStyle = C.COLOR_CHECKER_DARK;
                    }
                    
                    // Clip to valid area
                    const clipY = Math.max(y, aValidTop);
                    const clipHeight = Math.min(y + actualSquareH, aValidBottom) - clipY;
                    
                    if (clipHeight > 0) {
                        aCtx.fillRect(x, clipY, actualSquareW, clipHeight);
                    }
                }
            }
        }
        
        const aGrad = aCtx.createLinearGradient(0, aValidTop, 0, aValidBottom);
        aGrad.addColorStop(0, 'white');
        aGrad.addColorStop(1, 'rgba(255,255,255,0)');
        aCtx.fillStyle = aGrad;
        aCtx.fillRect(aValidLeft, aValidTop, aValidWidth, aValidHeight);
    }
}
    
        renderNodes() {
            this.drawHSElements();
            this.drawLightnessElements();
            this.drawAlphaElements();
        }
    
        
        drawHorizontalLine(ctx, y) {
            ctx.strokeStyle = C.COLOR_SELECTION_BLUE;
            ctx.lineWidth = 1.5; // Reduce from C.LINE_WIDTH_HORIZONTAL to 1
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(ctx.canvas.width, y);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    
    drawHSElements() {
        const canvas = this.elements.interactiveCanvases['hs'];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
        const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
        const totalMargin = glyphMargin + tickMargin;
        
        const clipX = totalMargin;
        const clipY = totalMargin;
        const clipWidth = canvas.width - totalMargin - glyphMargin;
        const clipHeight = canvas.height - totalMargin - glyphMargin;

        // Draw connecting lines first
        if (this.state.points.length > 1) {
            const numSegments = this.state.isCyclic ? this.state.points.length : this.state.points.length - 1;

            for (let i = 0; i < numSegments; i++) {
                const p1 = this.state.points[i];
                const p2 = this.state.points[(i + 1) % this.state.points.length];
                const effectiveOrder = Math.max(p1.order, p2.order);

                if (effectiveOrder === 0) continue;

                let segmentStartPos = p1.pos;
                let segmentEndPos = p2.pos;
                if (this.state.isCyclic && segmentEndPos < segmentStartPos) {
                    segmentEndPos += 1.0;
                }
                const segmentLength = segmentEndPos - segmentStartPos;
                if (segmentLength < 1e-9) continue;

                const steps = Math.max(10, Math.ceil(segmentLength * 100));
                const pathPoints = [];

                for (let j = 0; j <= steps; j++) {
                    const t = segmentStartPos + (j / steps) * segmentLength;
                    const props = this.getInterpolatedPropertiesAt(this.wrapPositionCyclic(t));
                    if (!props) continue;
                    
                    const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
                    const x = clamped.u * this.state.transform.scale + this.state.transform.offsetX;
                    const y = clamped.v * this.state.transform.scale + this.state.transform.offsetY;
                    pathPoints.push({ x, y, isOnPlane: Math.abs(props.lightness - this.state.viewLightness) < 1e-10 });
                }

                if (pathPoints.length < 2) continue;

                const allOnPlane = pathPoints.every(p => p.isOnPlane);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
                ctx.globalAlpha = allOnPlane ? 0.7 : 0.4;
                ctx.setLineDash(allOnPlane ? [] : C.DASHED_LINE_STYLE);

                ctx.beginPath();
                ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
                for (let k = 1; k < pathPoints.length; k++) {
                    ctx.lineTo(pathPoints[k].x, pathPoints[k].y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            this.drawLightnessIntersectionDots(ctx);
        }

        // Create clipping region for points
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipWidth, clipHeight);
        ctx.clip();

        this.state.points.forEach(point => {
            const x = point.hsPos.u * this.state.transform.scale + this.state.transform.offsetX;
            const y = point.hsPos.v * this.state.transform.scale + this.state.transform.offsetY;
            
            if (x >= clipX - C.NODE_RADIUS && x <= clipX + clipWidth + C.NODE_RADIUS &&
                y >= clipY - C.NODE_RADIUS && y <= clipY + clipHeight + C.NODE_RADIUS) {
                
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
                    case 3: this._drawTriangle(ctx, x, y, C.NODE_RADIUS); break;
                    default: this._drawCircle(ctx, x, y, C.NODE_RADIUS);
                }
                ctx.globalAlpha = point.alpha;
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fill();
                ctx.globalAlpha = 1.0;
                ctx.strokeStyle = isSelected ? C.COLOR_SELECTION_BLUE : 'black';
                ctx.lineWidth = isLastSelected ? C.LINE_WIDTH_SELECTED : C.LINE_WIDTH_DEFAULT;
                ctx.setLineDash(isOnCurrentPlane ? [] : C.DASHED_LINE_STYLE);
                ctx.stroke();
                ctx.restore();
            }
        });
        
        ctx.restore();
    }

    
    
        drawLightnessElements() {
    const canvas = this.elements.interactiveCanvases['lightness'];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const validLeft = totalMargin;
    const validRight = canvas.width - glyphMargin;
    const validTop = totalMargin;
    const validBottom = canvas.height - glyphMargin;
    const validWidth = validRight - validLeft;
    const validHeight = validBottom - validTop;
    
    let lightness = this.state.viewLightness;
    if (this.state.activeDrag.pointId && this.state.activeDrag.type === 'lightness') {
        const draggedPoint = this.getPointById(this.state.activeDrag.pointId);
        if (draggedPoint) {
            lightness = draggedPoint.lightness;
        }
    }
    
    const lineY = validBottom - lightness * validHeight;
    this.drawHorizontalLine(ctx, lineY);
    
    this.drawConnectingLine(ctx, 'lightness');
    this.drawTicks(ctx, 'lightness');
    
    this.state.points.forEach((point) => {
        const x = validLeft + point.pos * validWidth;
        const y = validBottom - point.lightness * validHeight;
        const color = this.abstractToRgb(point.hsPos.u, point.hsPos.v, point.lightness);
        const {r, g, b} = this.clampColor(color);
        const isSelected = this.state.selectedPointIds.has(point.id);
        const isLastSelected = point.id === this.state.lastSelectedPointId;
        this.drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected, point.order);
    });
}

    
    drawConnectingLine(ctx, type) {
    if (this.state.points.length < 2) return;

    ctx.save();
    ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
    
    const points = this.state.points;
    const n = points.length;

    if (type === 'hs') {
        ctx.restore();
        return;
    }
    
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const validLeft = totalMargin;
    const validBottom = ctx.canvas.height - glyphMargin;
    const validWidth = ctx.canvas.width - totalMargin - glyphMargin;
    const validHeight = validBottom - totalMargin;
    const validRight = validLeft + validWidth;
    
    if (validWidth <= 0) {
        ctx.restore();
        return;
    }

    const numSegments = this.state.isCyclic ? n : n - 1;
    
    for (let i = 0; i < numSegments; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const effectiveOrder = Math.max(p1.order, p2.order);
        const isCyclicSegment = this.state.isCyclic && i === n - 1;

        if (effectiveOrder === 0) {
            // Handle constant interpolation (step functions)
            const y1_screen = validBottom - p1[type] * validHeight;
            const y2_screen = validBottom - p2[type] * validHeight;
            const x1_screen = validLeft + p1.pos * validWidth;
            const x2_screen = validLeft + p2.pos * validWidth;

            if (isCyclicSegment && p1.pos > p2.pos) {
                let startPos = p1.pos;
                let endPos = p2.pos + 1.0;
                const transitionPos = startPos + (endPos - startPos) * 0.5;
                const transitionX = validLeft + (transitionPos - Math.floor(transitionPos)) * validWidth;
                
                const props1 = this.getInterpolatedPropertiesAt(p1.pos);
                const props2 = this.getInterpolatedPropertiesAt(p2.pos);
                
                if (props1) {
                    const color1 = this.abstractToRgb(props1.u, props1.v, props1.lightness); 
                    const rgb1 = this.clampColor(color1);
                    ctx.strokeStyle = `rgba(${rgb1.r},${rgb1.g},${rgb1.b},${props1.alpha})`;
                    ctx.setLineDash([]);
                    
                    if (transitionPos > 1.0) {
                        ctx.beginPath(); ctx.moveTo(x1_screen, y1_screen); ctx.lineTo(validRight, y1_screen); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(validLeft, y1_screen); ctx.lineTo(transitionX, y1_screen); ctx.stroke();
                    } else {
                        ctx.beginPath(); ctx.moveTo(x1_screen, y1_screen); ctx.lineTo(transitionX, y1_screen); ctx.stroke();
                    }
                }
                if (props2) {
                    const color2 = this.abstractToRgb(props2.u, props2.v, props2.lightness); 
                    const rgb2 = this.clampColor(color2);
                    ctx.strokeStyle = `rgba(${rgb2.r},${rgb2.g},${rgb2.b},${props2.alpha})`;
                    ctx.setLineDash([]);
                    
                    if (transitionPos > 1.0) {
                        ctx.beginPath(); ctx.moveTo(transitionX, y2_screen); ctx.lineTo(x2_screen, y2_screen); ctx.stroke();
                    } else {
                        ctx.beginPath(); ctx.moveTo(transitionX, y2_screen); ctx.lineTo(validRight, y2_screen); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(validLeft, y2_screen); ctx.lineTo(x2_screen, y2_screen); ctx.stroke();
                    }
                }
                
                ctx.beginPath(); ctx.setLineDash(C.DASHED_LINE_STYLE); ctx.strokeStyle = 'black';
                ctx.moveTo(transitionX, y1_screen); ctx.lineTo(transitionX, y2_screen); ctx.stroke();
                
            } else if (!isCyclicSegment) {
                let startPos = p1.pos;
                let endPos = p2.pos;
                const transitionPos = startPos + (endPos - startPos) * 0.5;
                const transitionX = validLeft + transitionPos * validWidth;
                
                const props1 = this.getInterpolatedPropertiesAt(p1.pos);
                const props2 = this.getInterpolatedPropertiesAt(p2.pos);
                
                if (props1) {
                    const color1 = this.abstractToRgb(props1.u, props1.v, props1.lightness); 
                    const rgb1 = this.clampColor(color1);
                    ctx.strokeStyle = `rgba(${rgb1.r},${rgb1.g},${rgb1.b},${props1.alpha})`;
                    ctx.setLineDash([]);
                    
                    const startX = (i === 0 && !this.state.isCyclic) ? validLeft : x1_screen;
                    ctx.beginPath(); ctx.moveTo(startX, y1_screen); ctx.lineTo(transitionX, y1_screen); ctx.stroke();
                }
                if (props2) {
                    const color2 = this.abstractToRgb(props2.u, props2.v, props2.lightness); 
                    const rgb2 = this.clampColor(color2);
                    ctx.strokeStyle = `rgba(${rgb2.r},${rgb2.g},${rgb2.b},${props2.alpha})`;
                    ctx.setLineDash([]);
                    
                    const endX = (i === numSegments - 1 && !this.state.isCyclic) ? validRight : x2_screen;
                    ctx.beginPath(); ctx.moveTo(transitionX, y2_screen); ctx.lineTo(endX, y2_screen); ctx.stroke();
                }
                
                ctx.beginPath(); ctx.setLineDash(C.DASHED_LINE_STYLE); ctx.strokeStyle = 'black';
                ctx.moveTo(transitionX, y1_screen); ctx.lineTo(transitionX, y2_screen); ctx.stroke();
            }

        } else {
            // Handle linear/cubic interpolation
            ctx.setLineDash([]);
            
            if (isCyclicSegment && p1.pos > p2.pos) {
                const y1_screen = validBottom - p1[type] * validHeight;
                const y2_screen = validBottom - p2[type] * validHeight;
                const x1_screen = validLeft + p1.pos * validWidth;
                const x2_screen = validLeft + p2.pos * validWidth;
                
                // First segment: from p1.pos to 1.0
                const distanceToOne = 1.0 - p1.pos;
                if (distanceToOne > 1e-6) {
                    const gradient1 = ctx.createLinearGradient(x1_screen, 0, validRight, 0);
                    const steps1 = Math.max(2, Math.ceil(distanceToOne * 20));
                    
                    for (let j = 0; j <= steps1; j++) {
                        const t = p1.pos + (j / steps1) * distanceToOne;
                        const props = this.getInterpolatedPropertiesAt(t);
                        if (props) {
                            const color = this.abstractToRgb(props.u, props.v, props.lightness);
                            const {r, g, b} = this.clampColor(color);
                            gradient1.addColorStop(j / steps1, `rgba(${r}, ${g}, ${b}, ${props.alpha})`);
                        }
                    }
                    
                    const propsAtOne = this.getInterpolatedPropertiesAt(1.0);
                    const yAtOne = propsAtOne ? validBottom - propsAtOne[type] * validHeight : y1_screen;
                    
                    ctx.beginPath();
                    ctx.moveTo(x1_screen, y1_screen);
                    ctx.lineTo(validRight, yAtOne);
                    ctx.strokeStyle = gradient1;
                    ctx.stroke();
                }
                
                // Second segment: from 0.0 to p2.pos
                if (p2.pos > 1e-6) {
                    const gradient2 = ctx.createLinearGradient(validLeft, 0, x2_screen, 0);
                    const steps2 = Math.max(2, Math.ceil(p2.pos * 20));
                    
                    for (let j = 0; j <= steps2; j++) {
                        const t = (j / steps2) * p2.pos;
                        const props = this.getInterpolatedPropertiesAt(t);
                        if (props) {
                            const color = this.abstractToRgb(props.u, props.v, props.lightness);
                            const {r, g, b} = this.clampColor(color);
                            gradient2.addColorStop(j / steps2, `rgba(${r}, ${g}, ${b}, ${props.alpha})`);
                        }
                    }
                    
                    const propsAtZero = this.getInterpolatedPropertiesAt(0.0);
                    const yAtZero = propsAtZero ? validBottom - propsAtZero[type] * validHeight : y2_screen;
                    
                    ctx.beginPath();
                    ctx.moveTo(validLeft, yAtZero);
                    ctx.lineTo(x2_screen, y2_screen);
                    ctx.strokeStyle = gradient2;
                    ctx.stroke();
                }
                
            } else if (!isCyclicSegment) {
                const x1_screen = validLeft + p1.pos * validWidth;
                const x2_screen = validLeft + p2.pos * validWidth;
                
                const drawSegment = (startT, endT, startX, endX) => {
                    const duration = endT - startT;
                    if (Math.abs(duration) < 1e-9) return;
                    const gradient = ctx.createLinearGradient(startX, 0, endX, 0);
                    const pathSteps = Math.ceil(Math.abs(endX - startX) / 2);
                    for (let j = 0; j <= pathSteps; j++) {
                        const t = startT + (j / pathSteps) * duration;
                        const props = this.getInterpolatedPropertiesAt(t); 
                        if (!props) continue;
                        const color = this.abstractToRgb(props.u, props.v, props.lightness);
                        const {r, g, b} = this.clampColor(color);
                        gradient.addColorStop(j / pathSteps, `rgba(${r}, ${g}, ${b}, ${props.alpha})`);
                    }
                    ctx.beginPath();
                    for (let j = 0; j <= pathSteps; j++) {
                        const t = startT + (j / pathSteps) * duration;
                        const props = this.getInterpolatedPropertiesAt(t); 
                        if (!props) continue;
                        // FIX: Don't use wrapPositionCyclic, use the actual t value clamped to [0,1]
                        const clampedT = Math.max(0, Math.min(1, t));
                        const x = validLeft + clampedT * validWidth;
                        const y = validBottom - props[type] * validHeight;
                        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.strokeStyle = gradient; 
                    ctx.stroke();
                };
                
                // CRITICAL FIX: Only draw extension to left edge if first point is NOT at position 0
                if (i === 0 && !this.state.isCyclic && Math.abs(p1.pos) >= 1e-6) {
                    const firstProps = this.getInterpolatedPropertiesAt(p1.pos);
                    if (firstProps) {
                        const color = this.abstractToRgb(firstProps.u, firstProps.v, firstProps.lightness);
                        const {r, g, b} = this.clampColor(color);
                        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${firstProps.alpha})`;
                        const y = validBottom - firstProps[type] * validHeight;
                        ctx.beginPath();
                        ctx.moveTo(validLeft, y);
                        ctx.lineTo(x1_screen, y);
                        ctx.stroke();
                    }
                }
                
                drawSegment(p1.pos, p2.pos, x1_screen, x2_screen);
                
                // CRITICAL FIX: Only draw extension to right edge if last point is NOT at position 1
                if (i === numSegments - 1 && !this.state.isCyclic && Math.abs(p2.pos - 1.0) >= 1e-6) {
                    const lastProps = this.getInterpolatedPropertiesAt(p2.pos);
                    if (lastProps) {
                        const color = this.abstractToRgb(lastProps.u, lastProps.v, lastProps.lightness);
                        const {r, g, b} = this.clampColor(color);
                        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lastProps.alpha})`;
                        const y = validBottom - lastProps[type] * validHeight;
                        ctx.beginPath();
                        ctx.moveTo(x2_screen, y);
                        ctx.lineTo(validRight, y);
                        ctx.stroke();
                    }
                }
            }
        }
    }
    ctx.restore();
}


shouldDrawDirectPath(p1, p2) {
    // Check if both points are at extreme lightness values where color space might be problematic
    const isP1Extreme = p1.lightness < 0.05 || p1.lightness > 0.95;
    const isP2Extreme = p2.lightness < 0.05 || p2.lightness > 0.95;
    
    if (isP1Extreme && isP2Extreme) {
        return true; // Draw direct path for extreme cases
    }
    
    // Check if the direct path would go through valid color space
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const testU = p1.hsPos.u + (p2.hsPos.u - p1.hsPos.u) * t;
        const testV = p1.hsPos.v + (p2.hsPos.v - p1.hsPos.v) * t;
        const testL = p1.lightness + (p2.lightness - p1.lightness) * t;
        
        const color = this.abstractToRgb(testU, testV, testL);
        if (!this.isValidColor(color.r, color.g, color.b)) {
            return false; // Path goes through invalid space
        }
    }
    
    return true;
}

drawInterpolatedPath(ctx, p1, p2, effectiveOrder) {
    const segmentLength = p2.pos - p1.pos;
    if (segmentLength < 1e-6) return;
    
    const steps = Math.max(2, Math.ceil(segmentLength * ctx.canvas.width / 4));
    let pathStarted = false;
    
    for (let j = 0; j <= steps; j++) {
        const t = p1.pos + (j / steps) * segmentLength;
        const props = this.getInterpolatedPropertiesAt(t);
        if (!props) continue;
        
        const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
        const x = clamped.u * this.state.transform.scale + this.state.transform.offsetX;
        const y = clamped.v * this.state.transform.scale + this.state.transform.offsetY;
        
        if (!pathStarted || (j === 0)) {
            ctx.moveTo(x, y);
            pathStarted = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
}

drawHSSegment(ctx, p1, p2, effectiveOrder, tolerance) {
        let segmentStartPos = p1.pos;
        let segmentEndPos = p2.pos;

        if (this.state.isCyclic && segmentEndPos < segmentStartPos) {
            segmentEndPos += 1.0;
        }
        const segmentLength = segmentEndPos - segmentStartPos;
        
        if (segmentLength < 1e-6 && !this.state.isCyclic) return;

        const steps = Math.max(10, Math.ceil(segmentLength * ctx.canvas.width / 8));
        const pathPoints = [];
        
        for (let j = 0; j <= steps; j++) {
            const t = segmentStartPos + (j / steps) * segmentLength;
            const props = this.getInterpolatedPropertiesAt(this.wrapPositionCyclic(t));
            if (!props) continue;
            
            const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
            const x = clamped.u * this.state.transform.scale + this.state.transform.offsetX;
            const y = clamped.v * this.state.transform.scale + this.state.transform.offsetY;
            const isExactlyOnPlane = Math.abs(props.lightness - this.state.viewLightness) < 1e-10;
            
            pathPoints.push({ x, y, isOnPlane: isExactlyOnPlane, u: clamped.u, v: clamped.v });
        }
        
        if (pathPoints.length < 2) return;
        
        const allOnPlane = pathPoints.every(p => p.isOnPlane);
        
        if (allOnPlane) {
            ctx.strokeStyle = 'black';
            ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.7;
            
            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i = 1; i < pathPoints.length; i++) {
                ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
            }
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'black';
            ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
            ctx.globalAlpha = 0.4;
            
            const hsDistance = Math.sqrt(
                (p2.hsPos.u - p1.hsPos.u) ** 2 + 
                (p2.hsPos.v - p1.hsPos.v) ** 2
            );
            
            const stableOffset = ((p1.hsPos.u * 73 + p1.hsPos.v * 127) * 50 + hsDistance * 100) % 8;
            
            ctx.setLineDash([4, 4]);
            ctx.lineDashOffset = stableOffset;
            
            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i = 1; i < pathPoints.length; i++) {
                ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
            }
            ctx.stroke();
            
            ctx.lineDashOffset = 0;
        }
        
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.7;
    }

drawLightnessIntersectionDots(ctx, tolerance) {
        const numSegments = this.state.isCyclic ? this.state.points.length : this.state.points.length - 1;

        for (let i = 0; i < numSegments; i++) {
            const p1 = this.state.points[i];
            const p2 = this.state.points[(i + 1) % this.state.points.length];
            
            const effectiveOrder = Math.max(p1.order, p2.order);
            if (effectiveOrder === 0) continue;
            
            const p1OnPlane = Math.abs(p1.lightness - this.state.viewLightness) < 1e-10;
            const p2OnPlane = Math.abs(p2.lightness - this.state.viewLightness) < 1e-10;
            
            if (p1OnPlane && p2OnPlane) {
                continue;
            }
            
            const l1 = p1.lightness;
            const l2 = p2.lightness;
            const currentL = this.state.viewLightness;
            
            if ((l1 < currentL && l2 > currentL) || (l1 > currentL && l2 < currentL)) {
                const intersectionT = this.findLightnessIntersection(p1, p2, currentL);
                if (intersectionT !== null) {
                    let segmentDuration = p2.pos - p1.pos;
                    if (this.state.isCyclic && p2.pos < p1.pos) {
                        segmentDuration += 1;
                    }

                    const globalT = p1.pos + intersectionT * segmentDuration;
                    const props = this.getInterpolatedPropertiesAt(globalT);
                    if (!props) continue;
                    
                    const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
                    const x = clamped.u * this.state.transform.scale + this.state.transform.offsetX;
                    const y = clamped.v * this.state.transform.scale + this.state.transform.offsetY;
                    
                    ctx.fillStyle = 'black';
                    ctx.beginPath();
                    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }
    }

findLightnessIntersection(p1, p2, targetLightness) {
    const l1 = p1.lightness;
    const l2 = p2.lightness;
    
    // Simple linear case
    if (Math.abs(l2 - l1) < 1e-10) {
        return null; // No intersection for parallel lines
    }
    
    // For linear interpolation, we can solve directly
    const effectiveOrder = Math.max(p1.order, p2.order);
    if (effectiveOrder === 1) {
        const t = (targetLightness - l1) / (l2 - l1);
        return (t > 0 && t < 1) ? t : null; // Exclude endpoints
    }
    
    // For cubic interpolation, use binary search
    let low = 0;
    let high = 1;
    const iterations = 25;
    
    for (let i = 0; i < iterations; i++) {
        const mid = (low + high) / 2;
        const globalT = p1.pos + (p2.pos - p1.pos) * mid;
        const props = this.getInterpolatedPropertiesAt(globalT);
        
        if (!props) break;
        
        if (Math.abs(props.lightness - targetLightness) < 1e-10) {
            return mid;
        }
        
        if (props.lightness < targetLightness) {
            if (l2 > l1) low = mid;
            else high = mid;
        } else {
            if (l2 > l1) high = mid;
            else low = mid;
        }
    }
    
    const finalT = (low + high) / 2;
    
    // Only return intersection if it's not at the endpoints
    return (finalT > 0.01 && finalT < 0.99) ? finalT : null;
}

    
    
   
drawTicks(ctx, type) {
    if (this.wrapper.style.display === 'none') {
        return;
    }
    
    const canvas = ctx.canvas;
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    ctx.save();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    
    const validLeft = totalMargin;
    const validRight = canvas.width - glyphMargin;
    const validTop = totalMargin;
    const validBottom = canvas.height - glyphMargin;
    const validWidth = validRight - validLeft;
    const validHeight = validBottom - validTop;
    
    this.clearTickLabels(canvas);
    
    const tickValues = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const tickExpressions = ['0', '0.2', '0.4', '0.6', '0.8', '1'];
    
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = this.wrapper.getBoundingClientRect();
    
    for (let i = 0; i < tickValues.length; i++) {
        const value = tickValues[i];
        const x = Math.floor(validLeft + value * validWidth) + 0.5;
        
        if (value === 0) {
            ctx.beginPath();
            ctx.moveTo(x, validTop);
            ctx.lineTo(x, validBottom + 5);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(x, validBottom);
            ctx.lineTo(x, validBottom + 5);
            ctx.stroke();
        }
        
        const labelX = canvasRect.left - wrapperRect.left + x;
        const labelY = canvasRect.top - wrapperRect.top + validBottom + 8;
        this.createKaTeXLabel(tickExpressions[i], labelX, labelY, 'bottom', canvas);
    }
    
    for (let i = 0; i < tickValues.length; i++) {
        const value = tickValues[i];
        const y = Math.floor(validBottom - value * validHeight) + 0.5;
        
        if (value === 0) {
            ctx.beginPath();
            ctx.moveTo(validLeft - 5, y);
            ctx.lineTo(validRight, y);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(validLeft - 5, y);
            ctx.lineTo(validLeft, y);
            ctx.stroke();
        }
        
        const labelX = canvasRect.left - wrapperRect.left + validLeft - 8;
        const labelY = canvasRect.top - wrapperRect.top + y;
        this.createKaTeXLabel(tickExpressions[i], labelX, labelY, 'left', canvas);
    }
    
    ctx.restore();
}


clearTickLabels(canvas) {
    // Remove existing tick labels for this canvas
    const existingLabels = document.querySelectorAll(`[data-tick-canvas="${canvas.dataset.type}"]`);
    existingLabels.forEach(label => label.remove());
}

createKaTeXLabel(expression, x, y, position, canvas) {
    if (this.wrapper.style.display === 'none') {
        return;
    }
    
    const div = document.createElement('div');
    const isFallback = typeof katex === 'undefined';

    div.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        color: white;
        font-size: 10px;
        pointer-events: none;
        z-index: 1001;
        transform: ${position === 'left' ? 'translate(-100%, -50%)' : 'translate(-50%, 0)'};
    `;
    div.dataset.tickCanvas = canvas.dataset.type;

    if (isFallback) {
        div.style.fontFamily = 'Arial, sans-serif';
        div.textContent = expression.replace(/\\frac\{(\d+)\}\{(\d+)\}/, '$1/$2');
    } else {
        try {
            katex.render(expression, div, {
                throwOnError: false,
                displayMode: false
            });
        } catch (error) {
            console.warn('KaTeX rendering failed:', error);
            div.textContent = expression;
        }
    }
    
    this.wrapper.appendChild(div);
}
    
    drawAlphaElements() {
    const canvas = this.elements.interactiveCanvases['alpha'];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const validLeft = totalMargin;
    const validRight = canvas.width - glyphMargin;
    const validTop = totalMargin;
    const validBottom = canvas.height - glyphMargin;
    const validWidth = validRight - validLeft;
    const validHeight = validBottom - validTop;
    
    let alpha = this.state.viewAlpha;
    if (this.state.activeDrag.pointId && this.state.activeDrag.type === 'alpha') {
        const draggedPoint = this.getPointById(this.state.activeDrag.pointId);
        if (draggedPoint) {
            alpha = draggedPoint.alpha;
        }
    }
    
    const lineY = validBottom - alpha * validHeight;
    this.drawHorizontalLine(ctx, lineY);
    
    this.drawConnectingLine(ctx, 'alpha');
    this.drawTicks(ctx, 'alpha');
    
    this.state.points.forEach((point) => {
        const x = validLeft + point.pos * validWidth;
        const y = validBottom - point.alpha * validHeight;
        const color = this.abstractToRgb(point.hsPos.u, point.hsPos.v, point.lightness);
        const {r, g, b} = this.clampColor(color);
        const isSelected = this.state.selectedPointIds.has(point.id);
        const isLastSelected = point.id === this.state.lastSelectedPointId;
        this.drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected, point.order);
    });
}

        _drawCircle(ctx, x, y, radius) {
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
        }
    
        _drawJoukowsky(ctx, x, y, radius, q) {
            const numPoints = 50;
            const points = [];
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
            for (let i = 0; i <= numPoints; i++) {
                const t = (i / numPoints) * 2 * Math.PI;
                const cosT = Math.cos(t);
                const sinT = Math.sin(t);
    
                const den_term1 = 1 - q + q * cosT;
                const den_term2 = q * sinT;
                const denominator = den_term1 * den_term1 + den_term2 * den_term2;
    
                if (Math.abs(denominator) < 1e-9) continue;
    
                const px = q * sinT - (q * sinT) / denominator;
                const py = q * cosT + den_term1 / denominator;
    
                points.push({ x: px, y: py });
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
            }
    
            const shapeHeight = maxY - minY;
            const scale = (radius * 2.5) / shapeHeight;
    
            const xOffset = (maxX + minX) / 2;
            const yOffset = (maxY + minY) / 2;
    
            ctx.beginPath();
    
            const p0 = points[0];
            ctx.moveTo(x + (p0.x - xOffset) * scale, y - (p0.y - yOffset) * scale);
            for (let i = 1; i < points.length; i++) {
                const p = points[i];
                ctx.lineTo(x + (p.x - xOffset) * scale, y - (p.y - yOffset) * scale);
            }
    
            ctx.closePath();
        }
    
        _drawDroplet(ctx, x, y, radius) {
            const q = 2 / 3;
            this._drawJoukowsky(ctx, x, y, radius, q);
        }
    
        _drawTriangle(ctx, x, y, radius) {
            const r = radius * 1.4;
            ctx.moveTo(x, y - r);
            ctx.lineTo(x + r * Math.sqrt(3) / 2, y + r / 2);
            ctx.lineTo(x - r * Math.sqrt(3) / 2, y + r / 2);
            ctx.closePath();
        }
    
        drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected, order) {
    ctx.beginPath();
    switch (order) {
        case 0: this._drawCircle(ctx, x, y, C.NODE_RADIUS); break;
        case 1: this._drawDroplet(ctx, x, y, C.NODE_RADIUS); break;
        case 3: this._drawTriangle(ctx, x, y, C.NODE_RADIUS); break;
        default: this._drawCircle(ctx, x, y, C.NODE_RADIUS);
    }

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
    const activeElement = document.activeElement;

    // Move this declaration to the top, before it's used
    const isEditingColor = [
        this.elements.rgbRInput, this.elements.rgbGInput, this.elements.rgbBInput,
        this.elements.hslHInput, this.elements.hslSInput
    ].includes(activeElement);

    const isRgb = this.state.colorSpace === 'RGB_CUBE';
    this.elements.rgbInputsContainer.classList.toggle('hidden', !isRgb);
    this.elements.hslInputsContainer.classList.toggle('hidden', isRgb);

    if (activeElement !== this.elements.lightnessInput) {
        this.elements.lightnessInput.value = this.state.viewLightness.toFixed(2);
    }
    if (activeElement !== this.elements.alphaInput) {
        this.elements.alphaInput.value = this.state.viewAlpha.toFixed(2);
    }
    if (activeElement !== this.elements.positionInput) {
        this.elements.positionInput.value = lastSelectedPoint ? lastSelectedPoint.pos.toFixed(2) : '--';
    }

    if (lastSelectedPoint) {
        this.elements.constantButton.classList.toggle('active', lastSelectedPoint.order === 0);
        this.elements.linearButton.classList.toggle('active', lastSelectedPoint.order === 1);
        this.elements.cubicButton.classList.toggle('active', lastSelectedPoint.order === 3);
    } else {
        this.elements.constantButton.classList.remove('active');
        this.elements.linearButton.classList.remove('active');
        this.elements.cubicButton.classList.remove('active');
    }

    // Update cycle button text
    this.elements.cycleButton.textContent = this.state.isCyclic ? 'Uncycle' : 'Cycle';

    this.elements.selectButton.disabled = this.state.points.length === 0;
    this.elements.reverseButton.disabled = this.state.points.length === 0;
    this.elements.cycleButton.disabled = this.state.points.length < 2;

    if (!lastSelectedPoint) {
        if (!isEditingColor) {
            this.elements.rgbRInput.value = '';
            this.elements.rgbGInput.value = '';
            this.elements.rgbBInput.value = '';
            this.elements.hslHInput.value = '';
            this.elements.hslSInput.value = '';
        }
        this.drawColormapPreview();
        this.drawSelectedColorPreview();
        return;
    }

    if (!isEditingColor) {
        const { lightness, hsPos } = lastSelectedPoint;
        const color = this.abstractToRgb(hsPos.u, hsPos.v, lightness);

        if (isRgb) {
            const { r, g, b } = this.clampColor(color);
            this.elements.rgbRInput.value = r;
            this.elements.rgbGInput.value = g;
            this.elements.rgbBInput.value = b;
        } else {
            const hsl = this.rgbToHsl(color.r, color.g, color.b);
            this.elements.hslHInput.value = hsl.h.toFixed(2);
            this.elements.hslSInput.value = hsl.s.toFixed(2);
        }
    }

    this.drawColormapPreview();
    this.drawSelectedColorPreview();
}
        
        drawSelectedColorPreview() {
   const canvas = this.elements.selectedColorPreviewCanvas;
   if (!canvas) return;
   
   const { clientWidth, clientHeight } = canvas.parentElement;
   if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
       canvas.width = clientWidth;
       canvas.height = clientHeight;
   }

   const ctx = canvas.getContext('2d');
   ctx.clearRect(0, 0, canvas.width, canvas.height);
   this.drawCheckerboard(ctx);

   const lastSelectedPoint = this.getLastSelectedPoint();
   if (lastSelectedPoint) {
       const { hsPos, lightness, alpha } = lastSelectedPoint;
       const color = this.abstractToRgb(hsPos.u, hsPos.v, lightness);
       const { r, g, b } = this.clampColor(color);

       ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
       ctx.fillRect(0, 0, canvas.width, canvas.height);
   }
}

    


    wrapPositionCyclic(pos) {
        if (!this.state.isCyclic) {
            return Math.max(0, Math.min(1, pos));
        }
        return ((pos % 1) + 1) % 1;
    }    

    drawColormapPreview() {
        const previewCtx = this.elements.colormapPreviewCanvas.getContext('2d');
        const width = this.elements.colormapPreviewCanvas.width;
        const height = this.elements.colormapPreviewCanvas.height;

        this.drawCheckerboard(previewCtx);

        if (this.state.points.length === 0) return;

        for (let i = 0; i < width; i++) {
            const t = i / (width - 1);
            const props = this.getInterpolatedPropertiesAt(t);
            if (!props) continue;

            const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
            const color = this.abstractToRgb(clamped.u, clamped.v, props.lightness);
            const { r, g, b } = this.clampColor(color);

            previewCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${props.alpha})`;
            previewCtx.fillRect(i, 0, 1, height);
        }
    }

    getInterpolatedPropertiesAt(t) {
        const points = this.state.points;
        const n = points.length;

        if (n === 0) return null;
        if (n === 1) {
            const p = points[0];
            return { u: p.hsPos.u, v: p.hsPos.v, lightness: p.lightness, alpha: p.alpha, order: p.order };
        }

        const isCyclic = this.state.isCyclic;
        const effectiveT = isCyclic ? ((t % 1) + 1) % 1 : t;

        let p1, p2;
        let segmentIndex = -1;

        // First, search for the segment containing t. This is the main logical change.
        for (let i = 0; i < n - 1; i++) {
            if (effectiveT >= points[i].pos && effectiveT <= points[i + 1].pos) {
                segmentIndex = i;
                p1 = points[i];
                p2 = points[i + 1];
                break;
            }
        }

        // If no segment was found, handle cyclic wrap-around or non-cyclic boundary cases.
        if (segmentIndex === -1) {
            if (isCyclic) {
                segmentIndex = n - 1;
                p1 = points[n - 1];
                p2 = points[0];
            } else {
                // Not cyclic, so t is outside the range. Return the nearest endpoint color.
                const p = (effectiveT < points[0].pos) ? points[0] : points[n - 1];
                return { u: p.hsPos.u, v: p.hsPos.v, lightness: p.lightness, alpha: p.alpha, order: p.order };
            }
        }
        
        if (!p1 || !p2) return null;

        let segmentDuration = p2.pos - p1.pos;
        if (isCyclic && segmentIndex === n - 1) {
            segmentDuration += 1;
        }

        // Avoid division by zero for points at the same position
        if (Math.abs(segmentDuration) < 1e-9) {
            return { u: p1.hsPos.u, v: p1.hsPos.v, lightness: p1.lightness, alpha: p1.alpha, order: p1.order };
        }

        let tLocal;
        if (isCyclic && segmentIndex === n - 1) {
            tLocal = (effectiveT >= p1.pos) ? (effectiveT - p1.pos) / segmentDuration : (effectiveT + 1 - p1.pos) / segmentDuration;
        } else {
            tLocal = (effectiveT - p1.pos) / segmentDuration;
        }
        
        const effectiveOrder = Math.max(p1.order, p2.order);

        if (effectiveOrder === 0) {
            const p = (tLocal < 0.5) ? p1 : p2;
            return { u: p.hsPos.u, v: p.hsPos.v, lightness: p.lightness, alpha: p.alpha, order: p.order };
        }

        if (effectiveOrder === 3) {
            const result = this.evaluateCubicSpline(segmentIndex, tLocal);
            if (result) {
                const L = Math.max(0, Math.min(1, result.lightness));
                const A = Math.max(0, Math.min(1, result.alpha));
                const clamped = this.clampAbstractPoint(result.u, result.v, L);
                return { u: clamped.u, v: clamped.v, lightness: L, alpha: A, order: 2 };
            }
        }

        // Fallback to linear
        return {
            u: p1.hsPos.u + (p2.hsPos.u - p1.hsPos.u) * tLocal,
            v: p1.hsPos.v + (p2.hsPos.v - p1.hsPos.v) * tLocal,
            lightness: p1.lightness + (p2.lightness - p1.lightness) * tLocal,
            alpha: p1.alpha + (p2.alpha - p1.alpha) * tLocal,
            order: 1
        };
    }
    
        abstractToRgb(u, v, lightness) {
            if (this.state.colorSpace === 'HSL_DI_CONE') {
                return this.hslDiConeAbstractToRgb(u, v, lightness);
            }
    
            const color = this.rgbCubeAbstractToRgb(u, v, lightness);
            if (!this.isValidColor(color.r, color.g, color.b)) {
                return { r: -1, g: -1, b: -1 };
            }
            return color;
        }
    
    clampAbstractPoint(u, v, lightness) {
    if (this.state.colorSpace === 'HSL_DI_CONE') {
        const radius = Math.sqrt(u * u + v * v);
        const radiusAtL = 1 - Math.abs(2 * lightness - 1);
        if (radius > radiusAtL && radiusAtL > 1e-6) {
            return { u: u / radius * radiusAtL, v: v / radius * radiusAtL };
        }
        return { u, v };
    }

    if (lightness <= 0.01 || lightness >= 0.99) {
        return { u: 0, v: 0 };
    }

    let { r, g, b } = this.abstractToRgb(u, v, lightness);
    if (this.isValidColor(r, g, b)) {
        return { u, v };
    }

    let bestU = 0;
    let bestV = 0;
    let minDistance = Infinity;
    
    const searchRadius = Math.max(Math.abs(u), Math.abs(v), 0.5);
    const gridSteps = 50;
    
    for (let i = 0; i <= gridSteps; i++) {
        for (let j = 0; j <= gridSteps; j++) {
            const testU = u + (i / gridSteps - 0.5) * 2 * searchRadius;
            const testV = v + (j / gridSteps - 0.5) * 2 * searchRadius;
            
            const testColor = this.abstractToRgb(testU, testV, lightness);
            if (this.isValidColor(testColor.r, testColor.g, testColor.b)) {
                const distance = Math.sqrt((testU - u) ** 2 + (testV - v) ** 2);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestU = testU;
                    bestV = testV;
                }
            }
        }
    }
    
    if (minDistance < Infinity) {
        return { u: bestU, v: bestV };
    }
    
    return { u: 0, v: 0 };
}
    
        hslToRgb(h, s, l) {
            if (s === 0) {
                return { r: l, g: l, b: l };
            }
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const r = hue2rgb(p, q, h + 1 / 3);
            const g = hue2rgb(p, q, h);
            const b = hue2rgb(p, q, h - 1 / 3);
            return { r, g, b };
        }
    
        rgbToHsl(r, g, b) {
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h = 0, s = 0, l = (max + min) / 2;
    
            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h, s, l };
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
    
    findClosestValidPoint(targetX, targetY, lightness) {
       const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
       const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
       const totalMargin = glyphMargin + tickMargin;
       
       const clipX = totalMargin;
       const clipY = totalMargin;
       const clipWidth = this.elements.hsBgCanvas.width - totalMargin - glyphMargin;
       const clipHeight = this.elements.hsBgCanvas.height - totalMargin - glyphMargin;
       
       const clampedTargetX = Math.max(clipX, Math.min(clipX + clipWidth, targetX));
       const clampedTargetY = Math.max(clipY, Math.min(clipY + clipHeight, targetY));
       
       const { scale, offsetX, offsetY } = this.state.transform;
       const targetU = (clampedTargetX - offsetX) / scale;
       const targetV = (clampedTargetY - offsetY) / scale;
       
       const targetColor = this.abstractToRgb(targetU, targetV, lightness);
       if (this.isValidColor(targetColor.r, targetColor.g, targetColor.b)) {
           return { x: clampedTargetX, y: clampedTargetY };
       }

       if (this.state.colorSpace === 'HSL_DI_CONE') {
           const radius = Math.sqrt(targetU * targetU + targetV * targetV);
           const radiusAtL = 1 - Math.abs(2 * lightness - 1);

           if (radius > radiusAtL && radiusAtL > 1e-6) {
               const clampedU = targetU / radius * radiusAtL;
               const clampedV = targetV / radius * radiusAtL;
               return {
                   x: clampedU * scale + offsetX,
                   y: clampedV * scale + offsetY
               };
           }
           return { x: clampedTargetX, y: clampedTargetY };
       }

       return this.findClosestPointOnRgbGamut(targetU, targetV, lightness, scale, offsetX, offsetY, clipX, clipY, clipWidth, clipHeight);
   }
    
        getGamutVerticesRgb(B) {
            const vertices = [];
            const isUnit = val => val >= -1e-6 && val <= 1.0 + 1e-6;
            const isNear = (v1, v2) => Math.abs(v1.r - v2.r) < 1e-6 && Math.abs(v1.g - v2.g) < 1e-6 && Math.abs(v1.b - v2.b) < 1e-6;
    
            const addVertex = (r, g, b) => {
                if (isUnit(r) && isUnit(g) && isUnit(b)) {
                    const newVert = { r, g, b };
                    if (!vertices.some(v => isNear(v, newVert))) {
                        vertices.push(newVert);
                    }
                }
            };
    
            const B3 = 3 * B;
            addVertex(B3, 0, 0); addVertex(0, B3, 0); addVertex(0, 0, B3);
            addVertex(1, B3 - 1, 0); addVertex(1, 0, B3 - 1); addVertex(B3 - 1, 1, 0);
            addVertex(0, 1, B3 - 1); addVertex(B3 - 1, 0, 1); addVertex(0, B3 - 1, 1);
            addVertex(1, 1, B3 - 2); addVertex(1, B3 - 2, 1); addVertex(B3 - 2, 1, 1);
    
            return vertices;
        }
    
        rgbCubeAbstractToRgb(u, v, lightness) {
            const basis1 = { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(2), z: 0 };
            const basis2 = { x: 1 / Math.sqrt(6), y: 1 / Math.sqrt(6), z: -2 / Math.sqrt(6) };
            const r = lightness + u * basis1.x + v * basis2.x;
            const g = lightness + u * basis1.y + v * basis2.y;
            const b = lightness + u * basis1.z + v * basis2.z;
            return {r, g, b};
        }
    
        findClosestPointOnRgbGamut(targetU, targetV, lightness, scale, offsetX, offsetY, clipX, clipY, clipWidth, clipHeight) {
       let closestU = targetU;
       let closestV = targetV;
       let minDistance = Infinity;
       
       const searchRadius = 0.5;
       const gridSteps = 50;
       
       for (let i = 0; i <= gridSteps; i++) {
           for (let j = 0; j <= gridSteps; j++) {
               const testU = targetU + (i / gridSteps - 0.5) * 2 * searchRadius;
               const testV = targetV + (j / gridSteps - 0.5) * 2 * searchRadius;
               
               const testColor = this.abstractToRgb(testU, testV, lightness);
               if (this.isValidColor(testColor.r, testColor.g, testColor.b)) {
                   const distance = Math.sqrt((testU - targetU) ** 2 + (testV - targetV) ** 2);
                   if (distance < minDistance) {
                       minDistance = distance;
                       closestU = testU;
                       closestV = testV;
                   }
               }
           }
       }
       
       if (minDistance < Infinity) {
           const refinedResult = this.refineClosestPoint(targetU, targetV, closestU, closestV, lightness);
           closestU = refinedResult.u;
           closestV = refinedResult.v;
       }
       
       const finalX = closestU * scale + offsetX;
       const finalY = closestV * scale + offsetY;
       
       return {
           x: Math.max(clipX, Math.min(clipX + clipWidth, finalX)),
           y: Math.max(clipY, Math.min(clipY + clipHeight, finalY))
       };
   }

   refineClosestPoint(targetU, targetV, initialU, initialV, lightness) {
       let bestU = initialU;
       let bestV = initialV;
       let searchRadius = 0.02;
       
       for (let iteration = 0; iteration < 5; iteration++) {
           let improved = false;
           const steps = 20;
           
           for (let i = 0; i <= steps; i++) {
               for (let j = 0; j <= steps; j++) {
                   const testU = bestU + (i / steps - 0.5) * 2 * searchRadius;
                   const testV = bestV + (j / steps - 0.5) * 2 * searchRadius;
                   
                   const testColor = this.abstractToRgb(testU, testV, lightness);
                   if (this.isValidColor(testColor.r, testColor.g, testColor.b)) {
                       const currentDistance = Math.sqrt((bestU - targetU) ** 2 + (bestV - targetV) ** 2);
                       const testDistance = Math.sqrt((testU - targetU) ** 2 + (testV - targetV) ** 2);
                       
                       if (testDistance < currentDistance) {
                           bestU = testU;
                           bestV = testV;
                           improved = true;
                       }
                   }
               }
           }
           
           searchRadius *= 0.5;
           
           if (!improved) break;
       }
       
       return { u: bestU, v: bestV };
   }
    
        findClosestPointOnPolygon(p, vertices) {
            let closestPoint = null;
            let minDistanceSq = Infinity;
    
            for (let i = 0; i < vertices.length; i++) {
                const v1 = vertices[i];
                const v2 = vertices[(i + 1) % vertices.length];
    
                const dx = v2.x - v1.x;
                const dy = v2.y - v1.y;
    
                let currentClosest;
                if (dx === 0 && dy === 0) {
                    currentClosest = v1;
                } else {
                    const t = ((p.x - v1.x) * dx + (p.y - v1.y) * dy) / (dx * dx + dy * dy);
                    if (t < 0) {
                        currentClosest = v1;
                    } else if (t > 1) {
                        currentClosest = v2;
                    } else {
                        currentClosest = { x: v1.x + t * dx, y: v1.y + t * dy };
                    }
                }
    
                const distSq = (p.x - currentClosest.x)**2 + (p.y - currentClosest.y)**2;
    
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestPoint = currentClosest;
                }
            }
            return closestPoint;
        }
    
    constrainPointToValidArea(point) {
       const originalColor = this.abstractToRgb(point.originalHsPos.u, point.originalHsPos.v, point.lightness);
       if (this.isValidColor(originalColor.r, originalColor.g, originalColor.b)) {
           point.hsPos = { ...point.originalHsPos };
           return;
       }

       const clamped = this.clampAbstractPoint(point.originalHsPos.u, point.originalHsPos.v, point.lightness);
       point.hsPos.u = clamped.u;
       point.hsPos.v = clamped.v;
   }
    
        findHitPointSlider(x, y, type) {
    const canvas = this.elements.interactiveCanvases[type];
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const validHeight = canvas.height - totalMargin - glyphMargin;
    const validBottom = canvas.height - glyphMargin;
    
    const lineY = type === 'lightness' 
        ? validBottom - this.state.viewLightness * validHeight
        : validBottom - this.state.viewAlpha * validHeight;
    
    let hitLine = Math.abs(y - lineY) <= C.LINE_HIT_RADIUS;

    let hitPoint = null;
    for (let i = 0; i < this.state.points.length; i++) {
        const point = this.state.points[i];
        const validWidth = canvas.width - totalMargin - glyphMargin;
        const px = totalMargin + point.pos * validWidth;
        const py = type === 'lightness' 
            ? validBottom - point.lightness * validHeight
            : validBottom - point.alpha * validHeight;
        
        const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (distance <= C.NODE_HIT_RADIUS) {
            hitPoint = point;
            break;
        }
    }
    return { hitPoint, hitLine };
}
    
        findHitPointSlider(x, y, type) {
    const canvas = this.elements.interactiveCanvases[type];
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const validHeight = canvas.height - 2 * glyphMargin;
    const validBottom = canvas.height - glyphMargin;
    
    const lineY = type === 'lightness' 
        ? validBottom - this.state.viewLightness * validHeight
        : validBottom - this.state.viewAlpha * validHeight;
    
    let hitLine = Math.abs(y - lineY) <= C.LINE_HIT_RADIUS;

    let hitPoint = null;
    for (let i = 0; i < this.state.points.length; i++) {
        const point = this.state.points[i];
        const validWidth = canvas.width - 2 * glyphMargin;
        const px = glyphMargin + point.pos * validWidth;
        const py = type === 'lightness' 
            ? validBottom - point.lightness * validHeight
            : validBottom - point.alpha * validHeight;
        
        const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (distance <= C.NODE_HIT_RADIUS) {
            hitPoint = point;
            break;
        }
    }
    return { hitPoint, hitLine };
}
    
    createNewPointHS(x, y) {
        const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
        const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
        const totalMargin = glyphMargin + tickMargin;
        
        const clipX = totalMargin;
        const clipY = totalMargin;
        const clipWidth = this.elements.hsBgCanvas.width - totalMargin - glyphMargin;
        const clipHeight = this.elements.hsBgCanvas.height - totalMargin - glyphMargin;
        
        // Only allow point creation within the valid area
        if (x < clipX || x > clipX + clipWidth || y < clipY || y > clipY + clipHeight) {
            return;
        }
        
        const au = (x - this.state.transform.offsetX) / this.state.transform.scale;
        const av = (y - this.state.transform.offsetY) / this.state.transform.scale;
        const { viewLightness, viewAlpha } = this.state;
        const {r, g, b} = this.abstractToRgb(au, av, viewLightness);
        if (this.isValidColor(r, g, b)) {
            this.markAsDirty();
            const n = this.state.points.length;
            if (n > 0) {
                this.state.points.forEach(p => {
                    p.pos = p.pos - (p.pos / n);
                });
            }
            const newPoint = {
                id: Date.now(),
                hsPos: {u: au, v: av},
                originalHsPos: {u: au, v: av},
                lightness: viewLightness,
                alpha: viewAlpha,
                pos: n === 0 ? 0.5 : 1.0,
                order: 1,
            };
            this.state.points.push(newPoint);
            this.sortPoints();
            this.state.selectedPointIds.clear();
            this.state.selectedPointIds.add(newPoint.id);
            this.state.lastSelectedPointId = newPoint.id;
            this.drawAll();
        }
    }
        
        handleLineDrag(y, canvasHeight, dragType) {
    const propertyName = dragType.startsWith('lightness') ? 'lightness' : 'alpha';
    const viewProperty = dragType.startsWith('lightness') ? 'viewLightness' : 'viewAlpha';

    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const validHeight = canvasHeight - totalMargin - glyphMargin;
    const validBottom = canvasHeight - glyphMargin;
    
    const snappedY = this.findSnapPosition(y, canvasHeight, propertyName);
    const normalizedY = (snappedY - totalMargin) / validHeight;
    const targetValue = Math.max(0, Math.min(1, 1 - normalizedY));

    // Only update the view property - don't mark as dirty since we're not editing points
    this.state[viewProperty] = targetValue;
    this.drawAll();
}
    
        handlePointDrag(x, y, canvas, dragType) {
            const point = this.getPointById(this.state.activeDrag.pointId);
            if (!point) return;
            if (dragType === 'hs') {
                this.handleHSPointDrag(x, y);
            } else if (dragType === 'lightness' || dragType === 'alpha') {
                this.handleSliderPointDrag(point, x, y, canvas, dragType);
            }
            this.drawAll();
        }
    
    handleHSPointDrag(x, y) {
        const { startX, startY, initialPointPositions } = this.state.activeDrag;
        const { scale, offsetX, offsetY } = this.state.transform;
        
        const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
        const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
        const totalMargin = glyphMargin + tickMargin;
        
        const clipX = totalMargin;
        const clipY = totalMargin;
        const clipWidth = this.elements.hsBgCanvas.width - totalMargin - glyphMargin;
        const clipHeight = this.elements.hsBgCanvas.height - totalMargin - glyphMargin;

        const dx = x - startX;
        const dy = y - startY;

        this.state.points.forEach(p => {
            if (initialPointPositions.has(p.id)) {
                const initialPos = initialPointPositions.get(p.id);
                const targetX = initialPos.x + dx;
                const targetY = initialPos.y + dy;

                // Clamp the target position to the drawable area first
                const clampedTargetX = Math.max(clipX, Math.min(clipX + clipWidth, targetX));
                const clampedTargetY = Math.max(clipY, Math.min(clipY + clipHeight, targetY));

                // Get the smooth boundary point within the drawable area
                const snapped = this.findClosestValidPoint(clampedTargetX, clampedTargetY, p.lightness);

                const snappedU = (snapped.x - offsetX) / scale;
                const snappedV = (snapped.y - offsetY) / scale;

                // Update both current and original positions for consistency
                p.hsPos = { u: snappedU, v: snappedV };
                
                // Only update originalHsPos if we're actually within the valid gamut
                // This prevents jumping when we return to valid space
                const testColor = this.abstractToRgb(snappedU, snappedV, p.lightness);
                if (this.isValidColor(testColor.r, testColor.g, testColor.b)) {
                    p.originalHsPos = { u: snappedU, v: snappedV };
                }
            }
        });
    }

    adjustPointForNewLightness(point, oldLightness) {
       const originalColor = this.abstractToRgb(point.originalHsPos.u, point.originalHsPos.v, point.lightness);
       
       if (this.isValidColor(originalColor.r, originalColor.g, originalColor.b)) {
           point.hsPos = { ...point.originalHsPos };
           return;
       }
       
       const clamped = this.clampAbstractPoint(point.originalHsPos.u, point.originalHsPos.v, point.lightness);
       point.hsPos.u = clamped.u;
       point.hsPos.v = clamped.v;
   }
    
    handleSliderPointDrag(point, x, y, canvas, dragType) {
    const { offsets } = this.state.activeDrag;
    const glyphMargin = Math.ceil(C.NODE_RADIUS * 2.2);
    const tickMargin = Math.ceil(C.CHECKERBOARD_SIZE / 2);
    const totalMargin = glyphMargin + tickMargin;
    
    const minX = totalMargin;
    const maxX = canvas.width - glyphMargin;
    const minY = totalMargin;
    const maxY = canvas.height - glyphMargin;
    let constrainedX = Math.max(minX, Math.min(maxX, x));
    const constrainedY = Math.max(minY, Math.min(maxY, y));

    const snappedY = this.findSnapPosition(y, canvas.height, dragType, point.id);
    
    const gradientLeft = totalMargin;
    const gradientRight = canvas.width - glyphMargin;
    const gradientTop = totalMargin;
    const gradientBottom = canvas.height - glyphMargin;
    const gradientWidth = gradientRight - gradientLeft;
    const gradientHeight = gradientBottom - gradientTop;

    const normalizedY = (snappedY - gradientTop) / gradientHeight;
    const primaryValue = Math.max(0, Math.min(1, 1 - normalizedY));

    let normalizedX = (x - gradientLeft) / gradientWidth;
    let primaryPos = normalizedX;

    if (this.state.isCyclic) {
        if (normalizedX < 0) {
            primaryPos = 1 + normalizedX;
        } else if (normalizedX > 1) {
            primaryPos = normalizedX - 1;
        }
        primaryPos = this.wrapPositionCyclic(primaryPos);
    } else {
        primaryPos = Math.max(0, Math.min(1, normalizedX));
    }

    for (const p of this.state.points) {
        if (offsets.has(p.id)) {
            const offset = offsets.get(p.id);
            const targetValue = primaryValue + offset[dragType];
            let targetPos = primaryPos + offset.pos;
            
            if (this.state.isCyclic) {
                targetPos = this.wrapPositionCyclic(targetPos);
            } else {
                targetPos = Math.max(0, Math.min(1, targetPos));
            }
            
            p.pos = targetPos;
            
            if (dragType === 'lightness') {
                const targetLightness = Math.max(0, Math.min(1, targetValue));
                p.lightness = targetLightness;
                
                const originalColor = this.abstractToRgb(p.originalHsPos.u, p.originalHsPos.v, targetLightness);
                if (this.isValidColor(originalColor.r, originalColor.g, originalColor.b)) {
                    p.hsPos = { ...p.originalHsPos };
                } else {
                    const clamped = this.clampAbstractPoint(p.originalHsPos.u, p.originalHsPos.v, targetLightness);
                    p.hsPos.u = clamped.u;
                    p.hsPos.v = clamped.v;
                }
                
                this.state.viewLightness = targetLightness;
            } else {
                p.alpha = Math.max(0, Math.min(1, targetValue));
                this.state.viewAlpha = p.alpha;
            }
        }
    }

    this.sortPoints();
}
}