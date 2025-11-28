import ColormapSelector from '../src/ColormapSelector.js';

document.addEventListener('DOMContentLoaded', async () => {
    const openEditorButton = document.getElementById('open-editor-button');
    const displayCanvas = document.getElementById('display-canvas');
    let currentColormapData = null;

    const userData = loadUserData();
    const colorEditor = new ColormapSelector(userData.customColors, userData.customColormaps);
    await colorEditor.initialize();
    document.body.appendChild(colorEditor.getElement());


    const exportButton = document.getElementById('export-button');

    exportButton.addEventListener('click', () => {
        // 1. Get the data from the editor instance
        const presets = colorEditor.getPresetsData();
        
        // 2. Create a blob and download it
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "colormap_presets.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    openEditorButton.addEventListener('click', (e) => {
        colorEditor.show();
    });

    // Add listener to re-open the editor on double-click
    displayCanvas.addEventListener('dblclick', () => {
        if (currentColormapData) {
            const initialState = {
                type: 'colormap',
                ...currentColormapData
            };
            colorEditor.show(null, null, initialState);
        } else {
            colorEditor.show(); // Open empty editor if no colormap is set
        }
    });

    colorEditor.getElement().addEventListener('select', (e) => {
        currentColormapData = e.detail; // Store the latest colormap data
        console.log('Colormap selected:', currentColormapData);
        
        // The 'points' property now contains the dense, pre-interpolated data
        drawColormapOnCanvas(currentColormapData.points, displayCanvas);
        
        saveUserData(colorEditor.customColors, colorEditor.customColormaps);
    });

    colorEditor.getElement().addEventListener('dataChanged', (e) => {
        saveUserData(e.detail.customColors, e.detail.customColormaps);
    });

    function loadUserData() {
        try {
            const customColors = JSON.parse(localStorage.getItem('customColors')) || {};
            const customColormaps = JSON.parse(localStorage.getItem('customColormaps')) || {};
            return { customColors, customColormaps };
        } catch (error) {
            console.error('Failed to load user data:', error);
            return { customColors: {}, customColormaps: {} };
        }
    }

    function saveUserData(customColors, customColormaps) {
        try {
            localStorage.setItem('customColors', JSON.stringify(customColors));
            localStorage.setItem('customColormaps', JSON.stringify(customColormaps));
        } catch (error) {
            console.error('Failed to save user data:', error);
        }
    }
    
    function drawColormapOnCanvas(points, canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        
        ctx.clearRect(0, 0, width, height);
        if (!points || points.length === 0) return;
        
        const gradient = ctx.createLinearGradient(0, 0, width, 0);

        points.forEach(point => {
            const r = Math.round(point.color[0]);
            const g = Math.round(point.color[1]);
            const b = Math.round(point.color[2]);
            const cssColor = `rgba(${r},${g},${b},${point.alpha})`;
            gradient.addColorStop(point.pos, cssColor);
        });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
});