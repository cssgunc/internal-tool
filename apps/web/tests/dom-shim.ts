/**
 * Lightweight, zero-dependency DOM shim for Bun to render and test React 19 client components.
 */

export interface SimpleTextNode {
  nodeType: 3;
  nodeName: "#text";
  textContent: string;
  parentNode: SimpleElement | null;
}

export interface SimpleCommentNode {
  nodeType: 8;
  nodeName: "#comment";
  textContent: string;
  parentNode: SimpleElement | null;
}

export type SimpleNode = SimpleElement | SimpleTextNode | SimpleCommentNode;
export type EventListenerFn = (event: unknown) => void;

export class SimpleElement {
  nodeName: string;
  tagName: string;
  nodeType = 1;
  childNodes: SimpleNode[] = [];
  parentNode: SimpleElement | null = null;
  style: Record<string, string> = {};
  ownerDocument: SimpleDocument | null = null;
  _attributes: Record<string, string> = {};
  _listeners: Record<string, EventListenerFn[]> = {};
  _value = "";
  _checked = false;
  _disabled = false;

  constructor(nodeName: string) {
    this.nodeName = nodeName.toUpperCase();
    this.tagName = this.nodeName;
    const globalDoc = (globalThis as unknown as { document?: SimpleDocument }).document;
    if (globalDoc) {
      this.ownerDocument = globalDoc;
    }
  }

  setAttribute(k: string, v: string | number | boolean) {
    this._attributes[k] = String(v);
    if (k === "disabled") this._disabled = true;
    if (k === "value") this._value = String(v);
    if (k === "checked") this._checked = true;
  }

  getAttribute(k: string): string | null {
    return this._attributes[k] ?? null;
  }

  removeAttribute(k: string) {
    delete this._attributes[k];
    if (k === "disabled") this._disabled = false;
    if (k === "checked") this._checked = false;
  }

  hasAttribute(k: string): boolean {
    return k in this._attributes;
  }

  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(v: boolean) {
    this._disabled = Boolean(v);
    if (v) this._attributes["disabled"] = "";
    else delete this._attributes["disabled"];
  }

  get value(): string {
    return this._value;
  }
  set value(v: string) {
    this._value = String(v);
    this._attributes["value"] = String(v);
  }

  get checked(): boolean {
    return this._checked;
  }
  set checked(v: boolean) {
    this._checked = Boolean(v);
    if (v) this._attributes["checked"] = "";
    else delete this._attributes["checked"];
  }

  get id(): string {
    return this._attributes["id"] || "";
  }
  set id(v: string) {
    this._attributes["id"] = v;
  }

  get type(): string {
    return this._attributes["type"] || "";
  }
  set type(v: string) {
    this._attributes["type"] = v;
  }

  get src(): string {
    return this._attributes["src"] || "";
  }
  set src(v: string) {
    this._attributes["src"] = v;
  }

  get role(): string {
    return this._attributes["role"] || "";
  }
  set role(v: string) {
    this._attributes["role"] = v;
  }

  get textContent(): string {
    return this.childNodes
      .map((c) => (c.nodeType === 3 ? c.textContent : c.textContent || ""))
      .join("");
  }
  set textContent(v: string) {
    this.childNodes = [
      {
        nodeType: 3,
        nodeName: "#text",
        textContent: String(v),
        parentNode: this,
      },
    ];
  }

  appendChild<T extends SimpleNode>(child: T): T {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild<T extends SimpleNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore<T extends SimpleNode>(child: T, refNode: SimpleNode | null): T {
    child.parentNode = this;
    if (refNode) {
      const idx = this.childNodes.indexOf(refNode);
      if (idx !== -1) {
        this.childNodes.splice(idx, 0, child);
        return child;
      }
    }
    this.childNodes.push(child);
    return child;
  }

  addEventListener(ev: string, fn: EventListenerFn) {
    this._listeners[ev] = this._listeners[ev] || [];
    this._listeners[ev].push(fn);
  }

  removeEventListener(ev: string, fn: EventListenerFn) {
    if (!this._listeners[ev]) return;
    this._listeners[ev] = this._listeners[ev].filter((f) => f !== fn);
  }

  dispatchEvent(event: { type: string; [key: string]: unknown }) {
    const eventType = event.type;
    const ev = { target: this, preventDefault: () => {}, ...event };
    const fns = this._listeners[eventType] || [];
    for (const fn of fns) {
      fn(ev);
    }
  }

  querySelectorAll(predicate: (node: SimpleElement) => boolean): SimpleElement[] {
    const matches: SimpleElement[] = [];
    const walk = (node: SimpleNode) => {
      if (node && node.nodeType === 1) {
        if (predicate(node)) matches.push(node);
        for (const child of node.childNodes || []) {
          walk(child);
        }
      }
    };
    walk(this);
    return matches;
  }

  querySelector(predicate: (node: SimpleElement) => boolean): SimpleElement | null {
    const all = this.querySelectorAll(predicate);
    return all.length > 0 ? (all[0] ?? null) : null;
  }

  get reactProps(): Record<string, unknown> {
    const self = this as unknown as Record<string, unknown>;
    const key = Object.keys(self).find((k) => k.startsWith("__reactProps"));
    return key && typeof self[key] === "object" && self[key] !== null
      ? (self[key] as Record<string, unknown>)
      : {};
  }

  simulateChange(valOrEvent: string | { target: { value?: string; checked?: boolean } }) {
    const props = this.reactProps;
    const onChange = props.onChange as
      ((e: { target: { value?: string; checked?: boolean } }) => void) | undefined;
    if (typeof valOrEvent === "object" && valOrEvent !== null && "target" in valOrEvent) {
      onChange?.(valOrEvent);
    } else {
      this.value = String(valOrEvent);
      onChange?.({ target: { value: String(valOrEvent), checked: Boolean(valOrEvent) } });
    }
  }

  simulateSubmit(event: Record<string, unknown> = {}) {
    const props = this.reactProps;
    const onSubmit = props.onSubmit as ((e: Record<string, unknown>) => void) | undefined;
    const ev = { preventDefault: () => {}, ...event };
    return onSubmit?.(ev);
  }

  simulateClick(event: Record<string, unknown> = {}) {
    const props = this.reactProps;
    const onClick = props.onClick as ((e: Record<string, unknown>) => void) | undefined;
    const ev = { preventDefault: () => {}, ...event };
    return onClick?.(ev);
  }
}

export class SimpleDocument {
  nodeType = 9;
  nodeName = "#document";
  documentElement: SimpleElement;
  head: SimpleElement;
  body: SimpleElement;
  defaultView: typeof globalThis;
  activeElement: unknown = null;
  _listeners: Record<string, EventListenerFn[]> = {};

  constructor() {
    this.documentElement = new SimpleElement("HTML");
    this.head = new SimpleElement("HEAD");
    this.body = new SimpleElement("BODY");
    this.documentElement.ownerDocument = this;
    this.head.ownerDocument = this;
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.defaultView = globalThis;
  }

  reset(): void {
    this.head.childNodes = [];
    this.body.childNodes = [];
    this._listeners = {};
    this.activeElement = null;
  }

  createElement(tag: string): SimpleElement {
    const el = new SimpleElement(tag);
    el.ownerDocument = this;
    return el;
  }

  createElementNS(_ns: string, tag: string): SimpleElement {
    return this.createElement(tag);
  }

  createTextNode(text: string): SimpleTextNode {
    return {
      nodeType: 3,
      nodeName: "#text",
      textContent: String(text),
      parentNode: null,
    };
  }

  createComment(text: string): SimpleCommentNode {
    return {
      nodeType: 8,
      nodeName: "#comment",
      textContent: String(text),
      parentNode: null,
    };
  }

  getElementById(id: string): SimpleElement | null {
    const search = (node: SimpleNode): SimpleElement | null => {
      if (node && node.nodeType === 1 && node.id === id) return node;
      if (node && node.nodeType === 1) {
        for (const child of node.childNodes || []) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(this.head) || search(this.body);
  }

  addEventListener(ev: string, fn: EventListenerFn) {
    this._listeners[ev] = this._listeners[ev] || [];
    this._listeners[ev].push(fn);
  }

  removeEventListener(ev: string, fn: EventListenerFn) {
    if (!this._listeners[ev]) return;
    this._listeners[ev] = this._listeners[ev].filter((f) => f !== fn);
  }
}

interface SavedGlobals {
  document: unknown;
  window: unknown;
  HTMLElement: unknown;
  HTMLDivElement: unknown;
  HTMLScriptElement: unknown;
  HTMLInputElement: unknown;
  HTMLButtonElement: unknown;
  HTMLFormElement: unknown;
  HTMLIFrameElement: unknown;
  IS_REACT_ACT_ENVIRONMENT: unknown;
}

let savedGlobals: SavedGlobals | null = null;
const originalFetch: typeof globalThis.fetch = globalThis.fetch;

export function mockFetch(
  fn: (url: string | URL | Request, opts?: RequestInit) => Promise<Response>
): void {
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
}

export function restoreFetch(): void {
  (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch = originalFetch;
}

export function installDomShim(): SimpleDocument {
  const target = globalThis as unknown as Record<string, unknown>;

  if (!savedGlobals) {
    savedGlobals = {
      document: target.document,
      window: target.window,
      HTMLElement: target.HTMLElement,
      HTMLDivElement: target.HTMLDivElement,
      HTMLScriptElement: target.HTMLScriptElement,
      HTMLInputElement: target.HTMLInputElement,
      HTMLButtonElement: target.HTMLButtonElement,
      HTMLFormElement: target.HTMLFormElement,
      HTMLIFrameElement: target.HTMLIFrameElement,
      IS_REACT_ACT_ENVIRONMENT: target.IS_REACT_ACT_ENVIRONMENT,
    };
  }

  // Always instantiate a fresh document with clean head and body nodes
  const doc = new SimpleDocument();
  target.IS_REACT_ACT_ENVIRONMENT = true;
  target.document = doc;
  target.window = globalThis;
  target.HTMLElement = SimpleElement;
  target.HTMLDivElement = SimpleElement;
  target.HTMLScriptElement = SimpleElement;
  target.HTMLInputElement = SimpleElement;
  target.HTMLButtonElement = SimpleElement;
  target.HTMLFormElement = SimpleElement;
  target.HTMLIFrameElement = class {};

  return doc;
}

export function resetDom(): SimpleDocument {
  return installDomShim();
}

export function uninstallDomShim() {
  restoreFetch();
  delete (globalThis as Record<string, unknown>).turnstile;
  if (!savedGlobals) return;
  const target = globalThis as unknown as Record<string, unknown>;
  target.document = savedGlobals.document;
  target.window = savedGlobals.window;
  target.HTMLElement = savedGlobals.HTMLElement;
  target.HTMLDivElement = savedGlobals.HTMLDivElement;
  target.HTMLScriptElement = savedGlobals.HTMLScriptElement;
  target.HTMLInputElement = savedGlobals.HTMLInputElement;
  target.HTMLButtonElement = savedGlobals.HTMLButtonElement;
  target.HTMLFormElement = savedGlobals.HTMLFormElement;
  target.HTMLIFrameElement = savedGlobals.HTMLIFrameElement;
  target.IS_REACT_ACT_ENVIRONMENT = savedGlobals.IS_REACT_ACT_ENVIRONMENT;
  savedGlobals = null;
}
