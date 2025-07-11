import ColormapSelector from './ColormapSelector.js';
document.addEventListener('DOMContentLoaded', async () => {
    const openEditorButton = document.getElementById('open-editor-button');
    const displayCanvas = document.getElementById('display-canvas');

    const colorEditor = new ColormapSelector();
    await colorEditor.initialize();
    document.body.appendChild(colorEditor.getElement());

    openEditorButton.addEventListener('click', (e) => {
        colorEditor.show();
    });

    colorEditor.getElement().addEventListener('select', (e) => {
        const colormapPoints = e.detail.points;
        console.log('Colormap selected:', colormapPoints);
        
        colorEditor.hide();
        
        drawColormapOnCanvas(colormapPoints, displayCanvas);
    });

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