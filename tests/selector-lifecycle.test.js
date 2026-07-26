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

  const createContext = (canvas) => new Proxy({ canvas }, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (property === 'measureText') return () => ({ width: 10 });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set() {
      return true;
    }
  });
  dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return createContext(this);
  };
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
    assert.equal(element.inert, true);
    assert.equal(element.getAttribute('aria-hidden'), 'true');
    assert.equal(element.style.pointerEvents, 'none');

    selector.show();
    assert.equal(element.inert, false);
    assert.equal(element.hasAttribute('aria-hidden'), false);
    assert.equal(element.style.pointerEvents, 'auto');
    selector.drawAll();

    for (const type of ['lightness', 'alpha']) {
      const labels = element.querySelectorAll(`[data-tick-canvas="${type}"]`);
      assert.ok(labels.length > 0);
      labels.forEach((label) => {
        assert.equal(label.parentElement?.classList.contains('canvas-container'), true);
        assert.equal(label.closest('.preset-wrapper')?.id, `${type}-wrapper`);
      });
    }

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

    selector.hide();
    assert.equal(selector.state.activeDrag.type, null);
    assert.equal(element.inert, true);
    assert.equal(element.getAttribute('aria-hidden'), 'true');
    assert.equal(element.style.pointerEvents, 'none');
    assert.equal(element.style.display, 'none');

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

test('a horizontal touch swipe moves to the next mobile page', () => {
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
  Object.defineProperty(dom.window, 'innerWidth', {
    configurable: true,
    value: 390
  });
  dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return new Proxy({ canvas: this }, {
      get(target, property) {
        if (property in target) return target[property];
        if (property === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (property === 'measureText') return () => ({ width: 10 });
        if (property === 'getImageData') {
          return () => ({ data: new Uint8ClampedArray(4) });
        }
        return () => {};
      },
      set() {
        return true;
      }
    });
  };

  try {
    const selector = new ColormapSelector();
    selector.initialize();
    const element = selector.getElement();
    dom.window.document.body.append(element);
    const viewport = element.querySelector('.colormap-selector-viewport');
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0
    });
    viewport.scrollTo = ({ left }) => {
      viewport.scrollLeft = left;
    };

    const swipe = (target, pointerId, startX, endX) => {
      target.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: startX,
        clientY: 180
      }));
      dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        clientX: endX,
        clientY: 184
      }));
      dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        clientX: endX,
        clientY: 184
      }));
    };

    swipe(element.querySelector('#hs-nodes-container'), 11, 280, 100);
    assert.equal(viewport.scrollLeft, 320);
    assert.equal(
      element.querySelector('.colormap-selector-page-button.is-active')?.dataset.page,
      '1'
    );

    swipe(viewport, 12, 280, 100);
    assert.equal(viewport.scrollLeft, 640);
    assert.equal(
      element.querySelector('.colormap-selector-page-button.is-active')?.dataset.page,
      '2'
    );

    swipe(viewport, 13, 100, 280);
    assert.equal(viewport.scrollLeft, 320);
    assert.equal(
      element.querySelector('.colormap-selector-page-button.is-active')?.dataset.page,
      '1'
    );
    selector.destroy();
  } finally {
    previousGlobals.forEach((value, name) => {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    });
    dom.window.close();
  }
});

test('the visible RGB Cube and HSL Di-Cone canvas receives painted color pixels', () => {
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

  const contexts = new WeakMap();
  Object.defineProperties(dom.window.HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => 320 },
    clientHeight: { configurable: true, get: () => 240 }
  });
  dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
    if (contexts.has(this)) return contexts.get(this);
    const context = new Proxy({
      canvas: this,
      paintedImages: [],
      createImageData(width, height) {
        return {
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4)
        };
      },
      putImageData(imageData) {
        this.paintedImages.push(imageData);
      }
    }, {
      get(target, property) {
        if (property in target) return target[property];
        if (property === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (property === 'measureText') return () => ({ width: 10 });
        if (property === 'getImageData') {
          return () => ({ data: new Uint8ClampedArray(4) });
        }
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      }
    });
    contexts.set(this, context);
    return context;
  };

  try {
    const selector = new ColormapSelector();
    selector.initialize();
    dom.window.document.body.append(selector.getElement());
    selector.show();

    const canvas = selector.getElement().querySelector('#hs-bg-canvas');
    const hasOpaqueColor = (painted) => {
      assert.ok(painted);
      const pixels = painted.data;
      return Array.from(
        { length: pixels.length / 4 },
        (_, index) => index * 4
      ).some((offset) => (
        pixels[offset + 3] > 0
        && (
          pixels[offset] !== pixels[offset + 1]
          || pixels[offset + 1] !== pixels[offset + 2]
        )
      ));
    };
    const hsContext = contexts.get(canvas);
    const rgbImage = hsContext.paintedImages.at(-1);
    assert.equal(hasOpaqueColor(rgbImage), true);
    assert.equal(
      Array.from(
        { length: rgbImage.data.length / 4 },
        (_, index) => rgbImage.data[index * 4 + 3]
      ).every((alpha) => alpha === 255),
      true
    );

    const rgbPaintCount = hsContext.paintedImages.length;
    selector.getElement().querySelector('#tab-hsl-cone').click();

    assert.ok(hsContext.paintedImages.length > rgbPaintCount);
    assert.equal(selector.state.colorSpace, 'HSL_DI_CONE');
    assert.equal(hasOpaqueColor(hsContext.paintedImages.at(-1)), true);
    selector.destroy();
  } finally {
    previousGlobals.forEach((value, name) => {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    });
    dom.window.close();
  }
});
