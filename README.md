# Colormap Selector

A professional, standalone JavaScript component for creating and editing colormaps and color gradients. This component is self-contained, creates its own UI, and can be used as a popup in any web application. It offers a rich interface for manipulating color points in both RGB and HSL color spaces.

![Colormap Selector Screenshot](https://i.imgur.com/cf46aec5-0c93-47de-b5ee-cbb0ee193497.png)

## Features

-   **Dual Color Spaces**: Edit colors in either RGB Cube or HSL Di-Cone space.
-   **Interactive UI**: Drag-and-drop points to adjust color, lightness, alpha, and position.
-   **Undo/Redo**: Full support for undo and redo actions (`Ctrl+Z` / `Ctrl+Y`).
-   **Preset Management**: Load named presets and create, save, rename, or delete your own custom colors and colormaps in `localStorage`.
-   **Self-Contained**: Creates its own DOM elements and can be injected into any page as a popup.
-   **No Dependencies**: Written in pure JavaScript with no external libraries required.

## Installation

This package is designed to be installed directly from its GitHub repository using npm.

In your project's terminal, run the following command:

```bash
npm install github:svenviktorjonsson/colormap-selector
```

This will add the package to your `node_modules` folder and list it in your `package.json` dependencies.

## Usage

To use the Colormap Selector, you need to import the class and its corresponding stylesheet. Then, you can create an instance and call its `show()` method, typically in response to a user action like a button click.

**1. HTML Setup**

First, ensure you have an element in your HTML to trigger the color picker.

```html
<!DOCTYPE html>
<html>
<head>
    <title>Colormap Selector Example</title>
    <!-- Link to the component's stylesheet -->
    <link rel="stylesheet" href="node_modules/colormap-selector/styles.css">
</head>
<body>
    <button id="open-editor-button">Open Colormap Editor</button>

    <!-- Link to your application's script -->
    <script type="module" src="app.js"></script>
</body>
</html>
```

**2. JavaScript Implementation**

In your main application script (`app.js`), import and initialize the component.

```javascript
import ColormapSelector from 'colormap-selector';

// Wait for the DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Create a single instance of the editor for your application.
    const colorEditor = new ColormapSelector();

    // 2. Initialize the editor. This is an async operation that builds the UI
    //    and loads the necessary color preset files.
    //    It's crucial to `await` this call.
    await colorEditor.initialize();

    // 3. Add the editor's main element to your page's body.
    document.body.appendChild(colorEditor.getElement());

    // 4. Set up an event listener to show the editor.
    const openEditorButton = document.getElementById('open-editor-button');
    if (openEditorButton) {
        openEditorButton.addEventListener('click', (e) => {
            // Show the picker near the user's mouse click.
            colorEditor.show(e.clientX, e.clientY);
        });
    }
});
```

## API

### `new ColormapSelector()`
Creates a new instance of the editor component.

### `.initialize()`
An **async** method that must be called after creating the instance. It initializes the component, builds its DOM elements, and loads the required preset data files (`named_colors.json`, `named_colormaps.json`).

### `.show(x, y)`
Displays the editor component as a popup.

-   **x** (optional): The horizontal position (in pixels) for the top-left corner of the editor.
-   **y** (optional): The vertical position (in pixels) for the top-left corner of the editor.

### `.hide()`
Hides the editor component.

### `.getElement()`
Returns the main DOM element (`<div class="color-editor-layout">...</div>`) of the component. This is useful for appending the editor to a specific container on your page.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.