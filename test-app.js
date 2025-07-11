import ColormapSelector from './ColormapSelector.js';

document.addEventListener('DOMContentLoaded', async () => {
    const openEditorButton = document.getElementById('open-editor-button');
    const displayCanvas = document.getElementById('display-canvas');

    const userData = loadUserData();
    const colorEditor = new ColormapSelector(userData.customColors, userData.customColormaps);
    await colorEditor.initialize();
    document.body.appendChild(colorEditor.getElement());

    openEditorButton.addEventListener('click', (e) => {
        colorEditor.show();
    });

    colorEditor.getElement().addEventListener('select', (e) => {
        const colormapPoints = e.detail.colormap.points;
        console.log('Colormap selected:', colormapPoints);
        
        saveUserData(e.detail.customColors, e.detail.customColormaps);
        colorEditor.hide();
        
        drawColormapOnCanvas(colormapPoints, displayCanvas);
    });

    colorEditor.getElement().addEventListener('close', (e) => {
        saveUserData(e.detail.customColors, e.detail.customColormaps);
        colorEditor.hide();
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
        const gradient = ctx.createLinearGradient(0, 0, width, 0);

        points.forEach(point => {
            const cssColor = `rgba(${point.color.join(',')}, ${point.alpha})`;
            gradient.addColorStop(point.pos, cssColor);
        });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
});