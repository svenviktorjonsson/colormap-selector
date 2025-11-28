# Colormap Selector

A professional, standalone JavaScript component for creating and editing colormaps and color gradients. This component is self-contained, creates its own UI, and can be used as a popup in any web application. It offers a rich interface for manipulating color points in both RGB and HSL color spaces with advanced features like cyclic colormaps, cubic spline interpolation, and resolution-independent state management.

![Colormap Selector Interface](screenshot.png)

## Features

- **Dual Color Spaces**: Edit colors in either RGB Cube or HSL Di-Cone space with seamless switching.
- **Resolution Independence**: Keeps track of your original "Control Points" (sparse data) separate from the "Rendered Points" (dense data), allowing you to re-edit curves perfectly at any time.
- **Interpolation Control**: Per-segment control offering Constant, Linear, and Cubic Spline interpolation.
- **Cyclic Colormaps**: Create seamless looping gradients for scientific visualization or texture generation.
- **Undo/Redo**: Full state history support (`Ctrl+Z` / `Ctrl+Y`).
- **Preset Management**: Load standard scientific colormaps (Viridis, Jet, Magma) or save your own custom libraries.
- **Import/Export**: Easily inject custom color palettes at startup or export user creations to JSON.
- **Self-Contained**: Creates its own DOM elements and can be injected into any page as a popup.
- **No Dependencies**: Written in pure JavaScript with no external libraries required.

## Installation

This package is designed to be installed directly from its GitHub repository using npm.

In your project's terminal, run the following command:

```bash
npm install github:svenviktorjonsson/colormap-selector
```

## Quick Start

### 1. HTML Setup

Link the stylesheet and prepare a trigger element.

```html
<!DOCTYPE html>
<html>
<head>
    <title>Colormap Selector Example</title>
    <link rel="stylesheet" href="node_modules/colormap-selector/dist/style.css">
</head>
<body>
    <button id="open-editor-button">Open Editor</button>
    <canvas id="my-canvas"></canvas>
    
    <script type="module" src="app.js"></script>
</body>
</html>
```

### 2. JavaScript Implementation

```javascript
import ColormapSelector from 'colormap-selector';

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Create instance
    const colorEditor = new ColormapSelector();

    // 2. Initialize (Required async step to load internal data)
    await colorEditor.initialize();

    // 3. Add the component to the DOM
    document.body.appendChild(colorEditor.getElement());

    // 4. Setup state variable
    let activeMapState = null;

    // 5. Listen for results
    colorEditor.getElement().addEventListener('select', (e) => {
        const result = e.detail;
        
        // A. Use 'points' (High Res) for Rendering visual gradients
        renderGradient(result.points);
        
        // B. Save the ENTIRE object to restore the editor session later
        // This includes 'controlPoints' (Low Res) and the 'id'
        activeMapState = result; 
        
        // Optional: Persist to localStorage
        localStorage.setItem('savedColormap', JSON.stringify(result));
    });

    // 6. Open Editor (Restoring state if it exists)
    document.getElementById('open-editor-button').addEventListener('click', (e) => {
        if (activeMapState) {
            // Restore previous session
            colorEditor.show(e.clientX, e.clientY, {
                type: 'colormap',
                ...activeMapState 
            });
        } else {
            // Open fresh
            colorEditor.show(e.clientX, e.clientY);
        }
    });

    function renderGradient(points) {
        // Implementation for drawing points to canvas...
    }
});
```

## Key Concepts: Rendering vs. Editing

To allow for high-quality rendering while maintaining editability, the component returns two distinct datasets in the `select` event.

### 1. `points` (High Resolution)
* **What it is:** A dense array of pre-calculated points. It "bakes" the complex cubic math into simple linear steps.
* **Use case:** **Rendering**. Pass this array to your Canvas, WebGL shader, or CSS gradient generator. You only need to perform linear interpolation between these points.

### 2. `controlPoints` (Low Resolution)
* **What it is:** The source data containing only the "handles" the user created, plus their interpolation settings (Constant, Linear, Cubic).
* **Use case:** **State Restoration**. Pass this back to the editor's `show()` method to allow the user to continue editing exactly where they left off.

> **Important:** If you only save the `points` array and reload it into the editor, the user will see hundreds of unmovable handles instead of their original curves. **Always save the full object returned by the select event.**

## Managing Presets (Import/Export)

You can preload the editor with your own custom colors and colormaps, or export what the user creates to a JSON file.

### Loading Custom Presets on Startup
Pass your data objects to the constructor. These will be **merged** with any data found in the user's LocalStorage.

```javascript
const myCompanyColors = {
    "Brand Blue": { rgb: [0, 100, 255], alpha: 1 }
};

const myScientificMaps = {
    "Deep Ocean": {
        isCyclic: false,
        points: [
            { pos: 0, color: [0,0,50], alpha: 1, order: 3 },
            { pos: 1, color: [0,100,255], alpha: 1, order: 1 }
        ]
    }
};

const editor = new ColormapSelector(myCompanyColors, myScientificMaps);
await editor.initialize();
```

### Exporting User Presets
You can extract the current library of custom colors and maps to save them to a file.

```javascript
const currentPresets = editor.getPresetsData();
// Returns: { customColors: {...}, customColormaps: {...} }

// Example: Save to JSON file
const blob = new Blob([JSON.stringify(currentPresets, null, 2)], {type: "application/json"});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = "user_presets.json";
a.click();
```

## API Reference

### Constructor
```javascript
new ColormapSelector(customColors = {}, customColormaps = {})
```
- `customColors`: Object mapping names to `{ rgb: [r,g,b], alpha: 0-1 }`.
- `customColormaps`: Object mapping names to `{ points: [...], isCyclic: boolean }`.

### Methods

#### `async initialize()`
Loads internal data files. Must be called before use.

#### `show(x, y, initialState)`
Shows the editor at coordinates `(x, y)`.
- `x`, `y`: Screen coordinates (px) to position the popup.
- `initialState` (optional): Object to pre-load a specific map.
  - `{ type: 'colormap', ...savedDataObject }`: Restores a full editing session (requires `id` and `controlPoints`).
  - `{ type: 'colormapName', name: 'viridis' }`: Loads a preset by name.
  - `{ type: 'color', color: [255,0,0] }`: Starts with a single color.

#### `hide()`
Closes the editor.

#### `getElement()`
Returns the main DOM element (`HTMLElement`).

#### `getPresetsData()`
Returns an object containing all custom colors and colormaps created by the user or loaded via constructor.

### Events

#### `select`
Fired when the user clicks the "Select" button.
```javascript
e.detail = {
    id: "cm-1732...",         // Unique ID for this map instance
    isCyclic: boolean,        // True if map wraps around
    points: [...],            // High-res data for RENDERING
    controlPoints: [...]      // Low-res data for EDITING (Save this!)
}
```

#### `dataChanged`
Fired when the user creates, renames, or deletes a custom preset (color or colormap).
```javascript
e.detail = {
    customColors: {...},
    customColormaps: {...}
}
```
Use this to persist the user's preset library to LocalStorage if desired.

## License

MIT License - see LICENSE file for details.