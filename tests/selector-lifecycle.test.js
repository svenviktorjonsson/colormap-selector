import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import ColormapSelector from 'colormap-selector';

function pointerEvent(window, type, properties) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.entries(properties).forEach(([key, value]) => {
    Object.defineProperty(event, key, { configurable: true, value });
  });
  return event;
}

test('initializes, handles a touch pointer, and destroys owned resources', () => {
  const dom = new JSDOM('<!doctype html><body></body>', {
    pretendToBeVisual: true,
    url: 'https://example.test/'
  });
  const previousGlobals = new Map();
  const globals = {
    window: dom.window,
    document: dom.window.document,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: (callback) => callback(),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    }
  };
  Object.entries(globals).forEach(([name, value]) => {
    previousGlobals.set(name, globalThis[name]);
    globalThis[name] = value;
  });

  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (property === 'measureText') return () => ({ width: 10 });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set() {
      return true;
    }
  });
  dom.window.HTMLCanvasElement.prototype.getContext = () => context;
  dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 320,
    bottom: 240,
    width: 320,
    height: 240
  });

  try {
    const selector = new ColormapSelector();
    selector.initialize();
    const element = selector.getElement();
    dom.window.document.body.append(element);
    assert.ok(element.querySelector('.colormap-selector-viewport'));
    assert.equal(element.querySelectorAll('.colormap-selector-page-button').length, 3);

    const surface = element.querySelector('#hs-nodes-container');
    surface.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 120,
      clientY: 100
    }));
    assert.equal(selector.state.activeDrag.type, 'hs');

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 120,
      clientY: 100
    }));
    assert.equal(selector.state.activeDrag.type, null);

    selector.destroy();
    assert.equal(selector.getElement(), null);
    assert.equal(dom.window.document.querySelector('#colormap-selector-wrapper'), null);
  } finally {
    previousGlobals.forEach((value, name) => {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    });
    dom.window.close();
  }
});
