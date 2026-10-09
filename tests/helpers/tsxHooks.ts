import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute actual component functions with deterministic hooks and native stubs.
// This checks state/callback contracts, not rendering, physics, or device behavior.
export type Element = { type: unknown; props: Record<string, any> };
export class Hooks {
  private slots: any[] = [];
  private cursor = 0;
  private effects: (() => void)[] = [];
  render<T>(work: () => T): T {
    this.cursor = 0;
    const result = work();
    for (const effect of this.effects.splice(0)) effect();
    return result;
  }
  useState = (initial: any) => {
    const index = this.cursor++;
    if (!(index in this.slots)) this.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [this.slots[index], (value: any) => { this.slots[index] = typeof value === 'function' ? value(this.slots[index]) : value; }];
  };
  useRef = (initial: any) => {
    const index = this.cursor++;
    return this.slots[index] ??= { current: initial };
  };
  useMemo = (work: () => any, dependencies: any[]) => {
    const index = this.cursor++, previous = this.slots[index];
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      this.slots[index] = { dependencies, value: work() };
    }
    return this.slots[index].value;
  };
  useCallback = (work: any, dependencies: any[]) => this.useMemo(() => work, dependencies);
  useEffect = (work: () => (() => void) | void, dependencies: any[]) => {
    const index = this.cursor++, previous = this.slots[index];
    if (previous && dependencies.every((value, i) => value === previous.dependencies[i])) return;
    this.effects.push(() => {
      previous?.cleanup?.();
      this.slots[index] = { dependencies, cleanup: work() };
    });
  };
  dispose() {
    for (const entry of this.slots) entry?.cleanup?.();
  }
}

export function executeComponent(path: string, name: string, hooks: Hooks, bindings: Record<string, unknown>) {
  const sourceFile = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = sourceFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} must be a real component in ${path}`);
  const source = `globalThis.component = ${declaration.getText(sourceFile).replace(/^export default |^export /, '')}`;
  const context: any = {
    ...bindings,
    ...Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect'].map(key => [key, (hooks as any)[key]])),
    React: { createElement(type: any, props: any, ...children: any[]) { return { type, props: { ...props, children } }; } },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText, context);
  return context.component;
}

export function elements(root: any): Element[] {
  if (!root) return [];
  if (Array.isArray(root)) return root.flatMap(elements);
  if (typeof root !== 'object') return [];
  return [root, ...elements(root.props?.children)];
}

export function control(root: any, label: string) {
  const element = elements(root).find(item => item.props?.label === label || item.props?.accessibilityLabel === label);
  assert.ok(element, `Missing control ${label}`);
  return element.props;
}
