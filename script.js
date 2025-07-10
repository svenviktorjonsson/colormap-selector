import * as C from './constants.js';

class ColorEditor {
    constructor() {
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
            loadedColormapType: null
        };

        this.namedColors = {};
        this.customColors = {};
        this.namedColormaps = {};
        this.customColormaps = {};

        this.clickCount = 0;
        this.lastClickTime = 0;
        this.lastClickTarget = null;
    }

    async initialize() {
        try {
            this.initializeDOM();
            await this.loadAllPresets();

            this.populatePresets();
            this.loadColormap('viridis', 'named_colormaps', true);
            this.updateTabs();
            this.setupCanvases();
            this.setupEventListeners();
            this.drawAll();
        } catch (error) {
            console.error("FATAL: Could not initialize ColorEditor.", error);
            const editorElement = document.querySelector('.color-editor-layout') || document.body;
            editorElement.innerHTML = `
                <div style="padding: 2em; text-align: center; color: #d8000c; background-color: #ffbaba; border: 1px solid; margin: 10px; font-family: sans-serif;">
                    <strong>Application Failed to Start</strong>
                    <p>Could not load or parse critical data files. Please check the network connection and the validity of your JSON files, then reload.</p>
                </div>
            `;
        }
    }

    processColormapPresets() {
        console.log("--- Starting Colormap Processing ---");
        // Log a snapshot of the available colors to verify they loaded correctly.
        console.log("Available named colors at start:", JSON.parse(JSON.stringify(this.namedColors)));

        for (const name in this.namedColormaps) {
            console.log(`Processing colormap: '${name}'`);
            const originalColormap = this.namedColormaps[name];
            if (!originalColormap || !originalColormap.points) {
                console.log(`Skipping colormap '${name}' due to missing or invalid points array.`);
                continue;
            }

            this.processedNamedColormaps[name] = {
                points: originalColormap.points.map(p => {
                    let rgb;
                    // Log the point we are about to process
                    console.log(`  - Processing point at pos: ${p.pos}, with color value:`, p.color);

                    if (typeof p.color === 'string') {
                        console.log(`    > Color is a string. Looking up '${p.color}'...`);
                        rgb = this.namedColors[p.color] || (this.customColors[p.color] ? this.customColors[p.color].rgb : undefined);

                        if (!rgb) {
                            console.error(`    > LOOKUP FAILED for color name '${p.color}'. Defaulting to magenta.`);
                            rgb = [255, 0, 255]; // Use a bright, obvious error color.
                        } else {
                            console.log(`    > Lookup successful. Found RGB:`, rgb);
                        }
                    } else {
                        console.log(`    > Color is not a string. Using value directly.`);
                        rgb = p.color;
                    }

                    // Add a final check to ensure the resulting RGB value is a valid array.
                    if (!Array.isArray(rgb) || rgb.length !== 3) {
                         console.error(`    > RESULTING RGB IS INVALID!`, rgb, `Defaulting to red.`);
                         rgb = [255, 0, 0]; // Use another obvious error color.
                    }

                    return { pos: p.pos, color: rgb };
                })
            };
        }
        console.log("--- Finished Colormap Processing ---");
        // Log the final processed data that will be used for drawing icons.
        console.log("Final processed colormaps for rendering:", this.processedNamedColormaps);
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
            loadedColormapType: this.state.loadedColormapType
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
            // This will also throw an error for malformed JSON, which is what we want.
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

        [this.namedColors, this.customColors, this.namedColormaps, this.customColormaps] = await Promise.all([
            fetchPreset('named_colors.json'),
            loadFromStorage('custom_colors'),
            fetchPreset('named_colormaps.json'),
            loadFromStorage('custom_colormaps')
        ]);
    }

    saveCustomPresets(type) {
        const key = type === 'custom_colors' ? 'custom_colors' : 'custom_colormaps';
        const data = type === 'custom_colors' ? this.customColors : this.customColormaps;
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error(`Failed to save ${key} to localStorage`, e);
        }
    }

    initializeDOM() {
        this.elements = {
            tabRgbCube: document.getElementById('tab-rgb-cube'),
            tabHslCone: document.getElementById('tab-hsl-cone'),
            hsBgCanvas: document.getElementById('hs-bg-canvas'),
            hsNodesContainer: document.getElementById('hs-nodes-container'),
            lightnessBgCanvas: document.getElementById('lightness-bg-canvas'),
            lightnessNodesContainer: document.getElementById('lightness-nodes-container'),
            alphaBgCanvas: document.getElementById('alpha-bg-canvas'),
            alphaNodesContainer: document.getElementById('alpha-nodes-container'),
            selectedColorPreviewCanvas: document.getElementById('selected-color-preview-canvas'),
            colormapPreviewCanvas: document.getElementById('colormap-preview-canvas'),
            colorsPresetsWrapper: document.getElementById('colors-presets-wrapper'),
            colormapsPresetsWrapper: document.getElementById('colormaps-presets-wrapper'),
            selectButton: document.getElementById('select-button'),
            lightnessInput: document.getElementById('lightness-input'),
            alphaInput: document.getElementById('alpha-input'),
            rgbInputsContainer: document.getElementById('rgb-inputs-container'),
            hslInputsContainer: document.getElementById('hsl-inputs-container'),
            rgbRInput: document.getElementById('rgb-r-input'),
            rgbGInput: document.getElementById('rgb-g-input'),
            rgbBInput: document.getElementById('rgb-b-input'),
            hslHInput: document.getElementById('hsl-h-input'),
            hslSInput: document.getElementById('hsl-s-input'),
            hslLInput: document.getElementById('hsl-l-input'),
            modalOverlay: document.getElementById('modal-overlay'),
            modalDialog: document.getElementById('modal-dialog'),
            modalTitle: document.getElementById('modal-title'),
            modalInputContainer: document.getElementById('modal-input-container'),
            modalInput: document.getElementById('modal-input'),
            modalButtons: document.getElementById('modal-buttons'),
            contextMenu: document.getElementById('context-menu'),
            interactiveCanvases: {}
        };
        this.createInteractiveCanvas(this.elements.hsNodesContainer, 'hs');
        this.createInteractiveCanvas(this.elements.lightnessNodesContainer, 'lightness');
        this.createInteractiveCanvas(this.elements.alphaNodesContainer, 'alpha');
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
            const newPos = this.state.points.length > 0 ? 1.0 : 0.5;
            const newPoint = this.createPointFromRgb(r, g, b, 1.0, newPos, 1);
            this.state.points.push(newPoint);
            this.sortPoints();
            this.state.selectedPointIds.clear();
            this.state.selectedPointIds.add(newPoint.id);
            this.state.lastSelectedPointId = newPoint.id;
        } else {
            this.state.points.forEach(p => {
                if (this.state.selectedPointIds.has(p.id)) {
                    const newColor = this.convertRgbToCurrentColorspace(r, g, b);
                    p.hsPos = newColor.hsPos;
                    p.originalHsPos = { ...newColor.hsPos };
                    p.lightness = newColor.lightness;
                }
            });
        }
        
        // This is the new logic that fixes the issue.
        const lastSelectedPoint = this.getLastSelectedPoint();
        if (lastSelectedPoint) {
            this.state.viewLightness = lastSelectedPoint.lightness;
            this.state.viewAlpha = lastSelectedPoint.alpha;
        }

        this.drawAll();
    }

    loadColormap(name, type, isInitialLoad = false) {
        if (!isInitialLoad) this.saveState();
        
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

        if (this.state.points.length > 0) {
            const firstPointId = this.state.points[0].id;
            this.state.selectedPointIds.add(firstPointId);
            this.state.lastSelectedPointId = firstPointId;
            this.state.viewLightness = this.state.points[0].lightness;
            this.state.viewAlpha = this.state.points[0].alpha;
        } else {
            this.state.lastSelectedPointId = null;
        }

        this.state.loadedColormapName = name;
        this.state.loadedColormapType = type;
        this.setDirty(false);
        this.state.undoStack = [];
        this.state.redoStack = [];
        this.drawAll();
    }

    setupEventListeners() {
        this.elements.tabRgbCube.addEventListener('click', () => this.setColorSpace('RGB_CUBE'));
        this.elements.tabHslCone.addEventListener('click', () => this.setColorSpace('HSL_DI_CONE'));

        const mainContainer = document.querySelector('.color-editor-layout');
        mainContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deselectAll();
            this.hideContextMenu();
        });

        document.addEventListener('click', () => this.hideContextMenu());

        const resizeObserver = new ResizeObserver(() => this.setupCanvases());
        resizeObserver.observe(document.querySelector('.w-full'));

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

        const colorChangeHandler = () => this.handleColorInputChange();
        this.elements.rgbRInput.addEventListener('change', colorChangeHandler);
        this.elements.rgbGInput.addEventListener('change', colorChangeHandler);
        this.elements.rgbBInput.addEventListener('change', colorChangeHandler);
        this.elements.hslHInput.addEventListener('change', colorChangeHandler);
        this.elements.hslSInput.addEventListener('change', colorChangeHandler);
        this.elements.hslLInput.addEventListener('change', colorChangeHandler);

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

        this.elements.selectButton.addEventListener('click', () => {
            const output = { points: [] };
            output.points = this.state.points.map(p => {
                const color = this.abstractToRgb(p.hsPos.u, p.hsPos.v, p.lightness);
                const rgb = this.clampColor(color);
                return {
                    pos: parseFloat(p.pos.toFixed(4)),
                    alpha: parseFloat(p.alpha.toFixed(4)),
                    color: [rgb.r, rgb.g, rgb.b],
                    order: p.order
                };
            });
            console.log(JSON.stringify(output, null, 2));
        });
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
            this.customColormaps[newName] = { points };
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
                    resolve(inputConfig ? modalInput.value : btnLabel);
                };
                modalButtons.appendChild(btn);
            });

            modalOverlay.classList.remove('hidden');
            if (inputConfig) modalInput.focus();
        });
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

        const hsBgCanvas = this.elements.hsBgCanvas;
        const hsInteractiveCanvas = this.elements.interactiveCanvases['hs'];
        const hsContainer = hsBgCanvas.parentElement;

        const containerWidth = hsContainer.clientWidth;
        const containerHeight = hsContainer.clientHeight;

        let size = Math.min(containerWidth, containerHeight);
        size = Math.floor(size / C.CHECKERBOARD_SIZE) * C.CHECKERBOARD_SIZE;

        [hsBgCanvas, hsInteractiveCanvas].forEach(canvas => {
            if (!canvas) return;
            canvas.width = size;
            canvas.height = size;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            canvas.style.left = `${(containerWidth - size) / 2}px`;
            canvas.style.top = `${(containerHeight - size) / 2}px`;
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
                this.markAsDirty();
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
            } else if (this.clickCount === 2) {
                const hitIndex = this.state.points.findIndex(p => p.id === pointId);
                selectedPointIds.clear();
                const indicesToSelect = [hitIndex - 1, hitIndex, hitIndex + 1];
                indicesToSelect.forEach(index => {
                    if (index >= 0 && index < this.state.points.length) {
                        selectedPointIds.add(this.state.points[index].id);
                    }
                });
            } else if (isCtrlPressed) {
                if (selectedPointIds.has(pointId)) {
                    if (selectedPointIds.size > 1) selectedPointIds.delete(pointId);
                } else {
                    selectedPointIds.add(pointId);
                }
            } else if (shiftKey) {
                selectedPointIds.add(pointId);
            } else {
                selectedPointIds.clear();
                selectedPointIds.add(pointId);
            }
            this.state.lastSelectedPointId = pointId;
        } else if (type === 'hs') {
            this.createNewPointHS(x, y);
        } else if (type === 'lightness' || type === 'alpha') {
            const canvas = this.elements.interactiveCanvases[type];
            const value = Math.max(0, Math.min(1, 1 - (y / canvas.height)));
            if (type === 'lightness') {
                this.state.viewLightness = value;
            } else {
                this.state.viewAlpha = value;
            }
        }
        this.drawAll();
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
            l = parseFloat(this.elements.hslLInput.value);
            if (isNaN(h) || isNaN(s) || isNaN(l)) return;
            this.markAsDirty();
            h = Math.max(0, Math.min(1, h));
            s = Math.max(0, Math.min(1, s));
            l = Math.max(0, Math.min(1, l));
            const rgb = this.hslToRgb(h, s, l);
            const newHsPos = this.rgbToHslDiConeAbstract(rgb.r, rgb.g, rgb.b);
            this.state.points.forEach(p => {
                if (this.state.selectedPointIds.has(p.id)) {
                    p.hsPos = { ...newHsPos };
                    p.originalHsPos = { ...newHsPos };
                    p.lightness = l;
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

        if (['0', '1', '2', '3', '4'].includes(e.key)) {
            if (this.state.isMouseInCanvas && this.state.selectedPointIds.size > 0) {
                this.markAsDirty();
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

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.state.selectedPointIds.size > 0) {
                this.markAsDirty();
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

    getInterpolatedPropertiesAt(t) {
        if (this.state.points.length === 0) return null;
        if (this.state.points.length === 1) {
            const { hsPos, lightness, alpha, order } = this.state.points[0];
            return { u: hsPos.u, v: hsPos.v, lightness, alpha, order };
        }

        let p1 = this.state.points[0];
        if (t <= p1.pos) {
            const { hsPos, lightness, alpha, order } = p1;
            return { u: hsPos.u, v: hsPos.v, lightness, alpha, order };
        }

        let p2 = this.state.points[this.state.points.length - 1];
        if (t >= p2.pos) {
            const { hsPos, lightness, alpha, order } = p2;
            return { u: hsPos.u, v: hsPos.v, lightness, alpha, order };
        }

        for (let i = 0; i < this.state.points.length - 1; i++) {
            p1 = this.state.points[i];
            p2 = this.state.points[i + 1];
            if (t >= p1.pos && t <= p2.pos) {
                break;
            }
        }

        const p0 = this.state.points[this.state.points.indexOf(p1) - 1] || p1;
        const p3 = this.state.points[this.state.points.indexOf(p2) + 1] || p2;

        const segmentDuration = p2.pos - p1.pos;
        if (segmentDuration < 1e-6) {
            const { hsPos, lightness, alpha, order } = p1;
            return { u: hsPos.u, v: hsPos.v, lightness, alpha, order };
        }
        const tLocal = (t - p1.pos) / segmentDuration;

        let props;
        const order = p1.order === 0 ? 0 : Math.max(p1.order, p2.order);

        switch (order) {
            case 0:
                props = this._interpolateStep(p1, p2, tLocal);
                break;
            case 2:
            case 3:
            case 4:
                props = this._interpolateCubic(p0, p1, p2, p3, tLocal);
                break;
            case 1:
            default:
                props = this._interpolateLinear(p1, p2, tLocal);
                break;
        }
        props.order = p1.order;
        return props;
    }

    _interpolateLinear(p1, p2, t) {
        const lerp = (a, b, t) => a + (b - a) * t;
        return {
            u: lerp(p1.hsPos.u, p2.hsPos.u, t),
            v: lerp(p1.hsPos.v, p2.hsPos.v, t),
            lightness: lerp(p1.lightness, p2.lightness, t),
            alpha: lerp(p1.alpha, p2.alpha, t),
        };
    }

    _interpolateStep(p1, p2, t) {
        const currentPoint = t < 0.5 ? p1 : p2;
        return {
            u: currentPoint.hsPos.u,
            v: currentPoint.hsPos.v,
            lightness: currentPoint.lightness,
            alpha: currentPoint.alpha,
        };
    }

    _interpolateCubic(p0, p1, p2, p3, t) {
        const cerp = (a, b, c, d, t) => {
            const t2 = t * t;
            const t3 = t2 * t;
            const c0 = b;
            const c1 = 0.5 * (c - a);
            const c2 = a - 2.5 * b + 2 * c - 0.5 * d;
            const c3 = 0.5 * (-a + 3 * b - 3 * c + d);
            return c0 + c1 * t + c2 * t2 + c3 * t3;
        };
        return {
            u: cerp(p0.hsPos.u, p1.hsPos.u, p2.hsPos.u, p3.hsPos.u, t),
            v: cerp(p0.hsPos.v, p1.hsPos.v, p2.hsPos.v, p3.hsPos.v, t),
            lightness: cerp(p0.lightness, p1.lightness, p2.lightness, p3.lightness, t),
            alpha: cerp(p0.alpha, p1.alpha, p2.alpha, p3.alpha, t),
        };
    }

    isValidColor(r, g, b) {
        return r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001;
    }

    drawSliderBackgrounds() {
        const bCtx = this.elements.lightnessBgCanvas.getContext('2d');
        const bGrad = bCtx.createLinearGradient(0, 0, 0, this.elements.lightnessBgCanvas.height);
        bGrad.addColorStop(0, 'white');
        bGrad.addColorStop(1, 'black');
        bCtx.fillStyle = bGrad;
        bCtx.fillRect(0, 0, this.elements.lightnessBgCanvas.width, this.elements.lightnessBgCanvas.height);

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
        this.drawLightnessElements();
        this.drawAlphaElements();
    }

    drawHSSlice() {
        const { viewLightness, viewAlpha, colorSpace } = this.state;
        const width = this.elements.hsBgCanvas.width;
        const height = this.elements.hsBgCanvas.height;

        if (width === 0 || height === 0) return;

        const ctx = this.elements.hsBgCanvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        this.drawCheckerboard(ctx);

        const scale = (colorSpace === 'RGB_CUBE')
            ? Math.min(width, height) / (Math.sqrt(2/3) * 2) * C.HS_PLANE_SCALE_FACTOR
            : Math.min(width, height) / 2 * C.HS_PLANE_SCALE_FACTOR;

        this.state.transform.scale = scale;
        this.state.transform.offsetX = width / 2;
        this.state.transform.offsetY = height / 2;

        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const au = (i - this.state.transform.offsetX) / this.state.transform.scale;
                const av = (j - this.state.transform.offsetY) / this.state.transform.scale;
                const {r, g, b} = this.abstractToRgb(au, av, viewLightness);
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
        if (this.state.points.length <= 1) return;

        ctx.lineWidth = C.LINE_WIDTH_DEFAULT;
        ctx.globalAlpha = 0.7;

        ctx.beginPath();

        for (let i = 0; i < this.state.points.length - 1; i++) {
            const p1 = this.state.points[i];
            const p2 = this.state.points[i + 1];
            const segmentDuration = p2.pos - p1.pos;

            if (segmentDuration < 1e-6) continue;

            const numSteps = Math.max(2, Math.ceil(segmentDuration * ctx.canvas.width / 4));

            for (let j = 0; j <= numSteps; j++) {
                const t = p1.pos + (j / numSteps) * segmentDuration;
                const props = this.getInterpolatedPropertiesAt(t);
                if (!props) continue;

                let x, y;
                if (type === 'hs') {
                    const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
                    x = clamped.u * this.state.transform.scale + this.state.transform.offsetX;
                    y = clamped.v * this.state.transform.scale + this.state.transform.offsetY;
                } else {
                    x = t * ctx.canvas.width;
                    if (type === 'lightness') {
                        y = (1 - props.lightness) * ctx.canvas.height;
                    } else {
                        y = (1 - props.alpha) * ctx.canvas.height;
                    }
                }

                if (j === 0 && i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }

        ctx.strokeStyle = 'black';
        if (type !== 'hs') {
            ctx.globalAlpha = 1.0;
            const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
            const numGradientStops = Math.min(256, ctx.canvas.width);
            for (let i = 0; i <= numGradientStops; i++) {
                const t = i / numGradientStops;
                const props = this.getInterpolatedPropertiesAt(t);
                if (!props) continue;

                const clamped = this.clampAbstractPoint(props.u, props.v, props.lightness);
                const color = this.abstractToRgb(clamped.u, clamped.v, props.lightness);
                const { r, g, b } = this.clampColor(color);
                gradient.addColorStop(t, `rgba(${r}, ${g}, ${b}, ${props.alpha})`);
            }
            ctx.strokeStyle = gradient;
        }

        ctx.stroke();
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

    drawLightnessElements() {
        const canvas = this.elements.interactiveCanvases['lightness'];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawHorizontalLine(ctx, (1 - this.state.viewLightness) * canvas.height);
        if (this.state.points.length > 1) {
            this.drawConnectingLine(ctx, 'lightness');
        }
        this.state.points.forEach((point) => {
            const x = point.pos * canvas.width;
            const y = (1 - point.lightness) * canvas.height;
            const color = this.abstractToRgb(point.hsPos.u, point.hsPos.v, point.lightness);
            const {r, g, b} = this.clampColor(color);
            const isSelected = this.state.selectedPointIds.has(point.id);
            const isLastSelected = point.id === this.state.lastSelectedPointId;
            this.drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected, point.order);
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
        this.state.points.forEach((point) => {
            const x = point.pos * canvas.width;
            const y = (1 - point.alpha) * canvas.height;
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

    _drawEye(ctx, x, y, radius) {
        const a = 1.0;
        const h = radius * 1.3;
        const w = h / a;

        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.quadraticCurveTo(x + w, y, x, y + h);
        ctx.quadraticCurveTo(x - w, y, x, y - h);
        ctx.closePath();
    }

    _drawTriangle(ctx, x, y, radius) {
        const r = radius * 1.4;
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * Math.sqrt(3) / 2, y + r / 2);
        ctx.lineTo(x - r * Math.sqrt(3) / 2, y + r / 2);
        ctx.closePath();
    }

    _drawSquare(ctx, x, y, radius) {
        const size = radius * 2.2;
        ctx.rect(x - size / 2, y - size / 2, size, size);
    }

    drawPoint(ctx, x, y, r, g, b, isSelected, isLastSelected, order) {
        ctx.beginPath();
        switch (order) {
            case 0: this._drawCircle(ctx, x, y, C.NODE_RADIUS); break;
            case 1: this._drawDroplet(ctx, x, y, C.NODE_RADIUS); break;
            case 2: this._drawEye(ctx, x, y, C.NODE_RADIUS); break;
            case 3: this._drawTriangle(ctx, x, y, C.NODE_RADIUS); break;
            case 4: this._drawSquare(ctx, x, y, C.NODE_RADIUS); break;
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

        const isRgb = this.state.colorSpace === 'RGB_CUBE';
        this.elements.rgbInputsContainer.classList.toggle('hidden', !isRgb);
        this.elements.hslInputsContainer.classList.toggle('hidden', isRgb);

        if (activeElement !== this.elements.lightnessInput) {
            this.elements.lightnessInput.value = lastSelectedPoint ? lastSelectedPoint.lightness.toFixed(2) : '--';
        }
        if (activeElement !== this.elements.alphaInput) {
            this.elements.alphaInput.value = lastSelectedPoint ? lastSelectedPoint.alpha.toFixed(2) : '--';
        }

        const isEditingColor = [
            this.elements.rgbRInput, this.elements.rgbGInput, this.elements.rgbBInput,
            this.elements.hslHInput, this.elements.hslSInput, this.elements.hslLInput
        ].includes(activeElement);

        if (!lastSelectedPoint) {
            if (!isEditingColor) {
                this.elements.rgbRInput.value = '';
                this.elements.rgbGInput.value = '';
                this.elements.rgbBInput.value = '';
                this.elements.hslHInput.value = '';
                this.elements.hslSInput.value = '';
                this.elements.hslLInput.value = '';
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
                this.elements.hslLInput.value = hsl.l.toFixed(2);
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
            if (radius > radiusAtL) {
                return { u: u / radius * radiusAtL, v: v / radius * radiusAtL };
            }
            return { u, v };
        }

        let { r, g, b } = this.abstractToRgb(u, v, lightness);
        if (this.isValidColor(r, g, b)) {
            return { u, v };
        }

        let low = 0.0;
        let high = 1.0;
        const iterations = 10;

        for (let i = 0; i < iterations; i++) {
            const mid = (low + high) / 2;
            const testU = u * mid;
            const testV = v * mid;
            ({ r, g, b } = this.abstractToRgb(testU, testV, lightness));
            if (this.isValidColor(r, g, b)) {
                low = mid;
            } else {
                high = mid;
            }
        }
        return { u: u * low, v: v * low };
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
        if (this.state.colorSpace === 'HSL_DI_CONE') {
            const { scale, offsetX, offsetY } = this.state.transform;
            const u = (targetX - offsetX) / scale;
            const v = (targetY - offsetY) / scale;
            const radius = Math.sqrt(u * u + v * v);

            const radiusAtL = 1 - Math.abs(2 * lightness - 1);

            if (radius > radiusAtL) {
                const clampedU = u / radius * radiusAtL;
                const clampedV = v / radius * radiusAtL;
                return {
                    x: clampedU * scale + offsetX,
                    y: clampedV * scale + offsetY
                };
            }
            return { x: targetX, y: targetY };
        }

        const { scale, offsetX, offsetY } = this.state.transform;
        const u = (targetX - offsetX) / scale;
        const v = (targetY - offsetY) / scale;
        const { r, g, b } = this.abstractToRgb(u, v, lightness);
        if (this.isValidColor(r, g, b)) {
            return { x: targetX, y: targetY };
        }

        const verticesRgb = this.getGamutVerticesRgb(lightness);
        if (verticesRgb.length === 0) {
            return { x: offsetX, y: offsetY };
        }

        const verticesCanvas = verticesRgb.map(vRgb => {
            const vUv = this.rgbCubeRgbToAbstract(vRgb);
            return {
                x: vUv.u * scale + offsetX,
                y: vUv.v * scale + offsetY
            };
        });

        if (verticesCanvas.length < 2) {
            return verticesCanvas[0];
        }

        const centroid = verticesCanvas.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
        centroid.x /= verticesCanvas.length;
        centroid.y /= verticesCanvas.length;

        verticesCanvas.sort((a, b) => {
            const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
            const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
            return angleA - angleB;
        });

        return this.findClosestPointOnPolygon({ x: targetX, y: targetY }, verticesCanvas);
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
        let u = point.originalHsPos.u;
        let v = point.originalHsPos.v;

        for (let i = 10; i >= 0; i--) {
            const fraction = i / 10.0;
            const testU = u * fraction;
            const testV = v * fraction;
            const { r, g, b } = this.abstractToRgb(testU, testV, point.lightness);

            if (this.isValidColor(r, g, b)) {
                point.hsPos = { u: testU, v: testV };
                return;
            }
        }

        point.hsPos = { u: 0, v: 0 };
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
        const lineY = type === 'lightness' ? (1 - this.state.viewLightness) * canvas.height : (1 - this.state.viewAlpha) * canvas.height;
        let hitLine = Math.abs(y - lineY) <= C.LINE_HIT_RADIUS;

        let hitPoint = null;
        for (let i = 0; i < this.state.points.length; i++) {
            const point = this.state.points[i];
            const px = point.pos * canvas.width;
            const py = type === 'lightness' ? (1 - point.lightness) * canvas.height : (1 - point.alpha) * canvas.height;
            const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (distance <= C.NODE_HIT_RADIUS) {
                hitPoint = point;
                break;
            }
        }
        return { hitPoint, hitLine };
    }

    createNewPointHS(x, y) {
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

        const snappedY = this.findSnapPosition(y, canvasHeight, propertyName);
        const targetValue = Math.max(0, Math.min(1, 1 - (snappedY / canvasHeight)));

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

        const dx = x - startX;
        const dy = y - startY;

        this.state.points.forEach(p => {
            if (initialPointPositions.has(p.id)) {
                const initialPos = initialPointPositions.get(p.id);
                const targetX = initialPos.x + dx;
                const targetY = initialPos.y + dy;

                const snapped = this.findClosestValidPoint(targetX, targetY, p.lightness);

                const snappedU = (snapped.x - offsetX) / scale;
                const snappedV = (snapped.y - offsetY) / scale;

                p.hsPos = { u: snappedU, v: snappedV };
                p.originalHsPos = { u: snappedU, v: snappedV };
            }
        });
    }

    handleSliderPointDrag(point, x, y, canvas, dragType) {
        const { offsets } = this.state.activeDrag;

        const snappedY = this.findSnapPosition(y, canvas.height, dragType, point.id);
        const primaryValue = Math.max(0, Math.min(1, 1 - (snappedY / canvas.height)));
        const primaryPos = Math.max(0, Math.min(1, x / canvas.width));

        let minPossibleValue = 0;
        let maxPossibleValue = 1;
        let minPossiblePos = 0;
        let maxPossiblePos = 1;

        for (const p of this.state.points) {
            if (offsets.has(p.id)) {
                const offset = offsets.get(p.id);
                const offsetValue = offset[dragType];
                minPossibleValue = Math.max(minPossibleValue, -offsetValue);
                maxPossibleValue = Math.min(maxPossibleValue, 1 - offsetValue);
                const offsetPos = offset.pos;
                minPossiblePos = Math.max(minPossiblePos, -offsetPos);
                maxPossiblePos = Math.min(maxPossiblePos, 1 - offsetPos);
            }
        }

        const clampedPrimaryValue = Math.max(minPossibleValue, Math.min(maxPossibleValue, primaryValue));
        const clampedPrimaryPos = Math.max(minPossiblePos, Math.min(maxPossiblePos, primaryPos));

        for (const p of this.state.points) {
            if (offsets.has(p.id)) {
                const offset = offsets.get(p.id);
                p[dragType] = clampedPrimaryValue + offset[dragType];
                p.pos = clampedPrimaryPos + offset.pos;

                if (dragType === 'lightness') {
                    this.constrainPointToValidArea(p);
                }
            }
        }

        this.sortPoints();

        if (dragType === 'lightness') {
            this.state.viewLightness = point.lightness;
        } else {
            this.state.viewAlpha = point.alpha;
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const editor = new ColorEditor();
    await editor.initialize();
});