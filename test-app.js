import ColormapSelector from './ColormapSelector.js';

document.addEventListener('DOMContentLoaded', async () => {
    const openEditorButton = document.getElementById('open-editor-button');
    const displayCanvas = document.getElementById('display-canvas');

    // 1. Create and initialize the editor component
    const colorEditor = new ColormapSelector();
    await colorEditor.initialize();
    document.body.appendChild(colorEditor.getElement());

    // 2. Add an event listener to the button to show the editor
    openEditorButton.addEventListener('click', (e) => {
        // Position the editor near the button or mouse click
        const rect = openEditorButton.getBoundingClientRect();
        colorEditor.show(rect.left, rect.bottom + 10);
    });

    // 3. Listen for the custom 'select' event dispatched by the component
    colorEditor.getElement().addEventListener('select', (e) => {
        const colormapPoints = e.detail.points;
        console.log('Colormap selected:', colormapPoints);
        
        // Hide the editor upon selection
        colorEditor.hide();
        
        // Draw the selected colormap on our display canvas
        drawColormapOnCanvas(colormapPoints, displayCanvas);
    });

    /**
     * A helper function to draw a colormap gradient onto a canvas.
     * @param {Array} points - The array of colormap points.
     * @param {HTMLCanvasElement} canvas - The canvas to draw on.
     */
    function drawColormapOnCanvas(points, canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);

        // Build the gradient from the colormap points
        points.forEach(point => {
            const cssColor = `rgba(${point.color.join(',')}, ${point.alpha})`;
            gradient.addColorStop(point.pos, cssColor);
        });

        // Fill the canvas with the gradient
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
});
