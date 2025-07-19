// constants.js

// --- Colors ---
// Defines the color palette used for UI elements like borders, text, and selections.
export const COLOR_SELECTION_BLUE = '#3b82f6';
export const COLOR_CHECKER_DARK = '#4a5568';
export const COLOR_CHECKER_LIGHT = '#718096';
export const DBL_CLICK_SPEED = 300; // The time in ms to detect a double click.
export const COLOR_PANEL_BACKGROUND = '#242c3a';

// --- Line and Border Widths ---
// Specifies the thickness of lines and borders for both default and selected states.
export const LINE_WIDTH_DEFAULT = 2;
export const LINE_WIDTH_SELECTED = 3;
export const LINE_WIDTH_HORIZONTAL = 4;

// --- Node (Circle) Properties ---
// Controls the size of the draggable color nodes and their clickable area.
export const NODE_RADIUS = 9;
export const NODE_HIT_RADIUS = 12; // A larger radius to make nodes easier to click.

// --- UI Interaction ---
// Defines parameters for user interactions like dragging and clicking.
export const DRAG_THRESHOLD = 5; // The minimum distance (in pixels) the mouse must move to be considered a drag.
export const LINE_HIT_RADIUS = 8; // The clickable radius around slider lines.

// --- Canvas and Drawing ---
// General constants related to canvas rendering and layout.
export const CHECKERBOARD_SIZE = 8; // The size of squares in the background checkerboard pattern.
export const HS_PLANE_SCALE_FACTOR = 0.9; // The scaling factor for the HS plane to fit within its container.
export const SNAP_DISTANCE = 5;
// --- Dashed Line Style ---
// Defines the pattern for dashed lines, used for nodes on different planes.
export const DASHED_LINE_STYLE = [4, 4];
