const LIFECYCLE_MAP: Record<string, string> = {
  beforeMount: 'onBeforeMount',
  mounted: 'onMounted',
  beforeUpdate: 'onBeforeUpdate',
  updated: 'onUpdated',
  beforeDestroy: 'onBeforeUnmount',
  destroyed: 'onUnmounted',
  errorCaptured: 'onErrorCaptured',
  activated: 'onActivated',
  deactivated: 'onDeactivated',
};

// In <script setup> these run as part of the setup body — no wrapper needed.
const INLINE_LIFECYCLE_HOOKS = new Set(['beforeCreate', 'created']);

const SKIP_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'switch', 'do', 'try', 'catch', 'finally',
]);

const SIMPLE_TYPES = new Set([
  'string', 'number', 'boolean', 'bigint', 'symbol',
  'null', 'undefined', 'void', 'any', 'unknown', 'never',
]);

// Vue 3 Composition API functions that must be imported from 'vue'
const VUE3_IMPORTABLE = [
  'ref', 'reactive', 'computed', 'watch', 'watchEffect',
  'onBeforeMount', 'onMounted', 'onBeforeUpdate', 'onUpdated',
  'onBeforeUnmount', 'onUnmounted', 'onErrorCaptured',
  'onActivated', 'onDeactivated', 'defineAsyncComponent',
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isComplexType(tsType?: string, initValue?: string): boolean {
  if (initValue) {
    const v = initValue.trim();
    if (v.startsWith('{') || v.startsWith('[') || /^new\s/.test(v)) { return true; }
    if (/^(['"`]|-?\d|true|false|null|undefined)/.test(v)) { return false; }
  }
  if (tsType) {
    const base = tsType.replace(/\s*[|&]\s*(null|undefined)\s*/g, '').trim();
    if (SIMPLE_TYPES.has(base)) { return false; }
    if (base.endsWith('[]') || /^Array\s*</.test(base)) { return true; }
    if (/^(Map|Set|WeakMap|WeakSet|Record|Promise|Observable)\s*</.test(base)) { return true; }
    if (base.startsWith('{') || base.startsWith('[')) { return true; }
    if (/\w+\s*</.test(base)) { return true; }
    if (/^[A-Z]/.test(base)) { return true; }
    const parts = base.split(/\s*\|\s*/);
    if (parts.every(p => SIMPLE_TYPES.has(p) || /^['"`]/.test(p) || /^-?\d/.test(p))) { return false; }
  }
  return false;
}

function extractBody(text: string, openBrace: number): { body: string; end: number } {
  let depth = 1;
  let i = openBrace + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') { depth++; }
    else if (text[i] === '}') { depth--; }
    i++;
  }
  return { body: text.slice(openBrace + 1, i - 1), end: i };
}

function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, (_, c) => `-${c.toLowerCase()}`).replace(/^-/, '');
}

/** Scans converted code and returns the Vue 3 API names that are actually used. */
function detectVue3Imports(code: string): string[] {
  return VUE3_IMPORTABLE.filter(api => new RegExp(`\\b${api}\\s*\\(`).test(code));
}

/**
 * Finds a named top-level property in an object body string.
 * Returns the value and the start/end of the entire "key: value[,]" span.
 */
function findComponentProp(body: string, key: string): { value: string; start: number; end: number } | null {
  let i = 0;
  let depth = 0;

  while (i < body.length) {
    const c = body[i];

    // Skip string literals
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < body.length && body[i] !== q) { if (body[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }

    if (depth === 0) {
      const m = new RegExp(`^${key}\\s*:`).exec(body.slice(i));
      if (m) {
        const keyStart = i;
        let vi = i + m[0].length;
        while (vi < body.length && /[ \t\n]/.test(body[vi])) vi++;

        let vDepth = 0;
        let vEnd = vi;
        while (vEnd < body.length) {
          const vc = body[vEnd];
          if (vc === '"' || vc === "'" || vc === '`') {
            const q = vc; vEnd++;
            while (vEnd < body.length && body[vEnd] !== q) { if (body[vEnd] === '\\') vEnd++; vEnd++; }
            vEnd++; continue;
          }
          if (vc === '{' || vc === '[' || vc === '(') { vDepth++; }
          else if (vc === '}' || vc === ']' || vc === ')') { if (vDepth === 0) break; vDepth--; }
          else if (vc === ',' && vDepth === 0) break;
          vEnd++;
        }

        const hasComma = body[vEnd] === ',';
        return { value: body.slice(vi, vEnd).trim(), start: keyStart, end: vEnd + (hasComma ? 1 : 0) };
      }
    }
    i++;
  }
  return null;
}

/** Parses a filters object body (content inside `filters: { ... }`) into standalone declarations. */
function parseFiltersToFunctions(filtersBody: string): { names: string[]; decls: string[] } {
  const names: string[] = [];
  const decls: string[] = [];
  let i = 0;

  while (i < filtersBody.length) {
    while (i < filtersBody.length && /[\s,]/.test(filtersBody[i])) i++;
    if (i >= filtersBody.length) break;

    const nameMatch = /^(\w+)/.exec(filtersBody.slice(i));
    if (!nameMatch) { i++; continue; }

    const name = nameMatch[1];
    let j = i + nameMatch[0].length;
    while (j < filtersBody.length && /[ \t]/.test(filtersBody[j])) j++;

    if (filtersBody[j] === '(') {
      // Method shorthand: name(params) { body }
      let pDepth = 1; let k = j + 1;
      while (k < filtersBody.length && pDepth > 0) {
        if (filtersBody[k] === '(') pDepth++;
        else if (filtersBody[k] === ')') pDepth--;
        k++;
      }
      const params = filtersBody.slice(j + 1, k - 1);
      while (k < filtersBody.length && /\s/.test(filtersBody[k])) k++;
      if (filtersBody[k] === '{') {
        const { body, end } = extractBody(filtersBody, k);
        names.push(name); decls.push(`function ${name}(${params}) {${body}}`);
        i = end; continue;
      }
    } else if (filtersBody[j] === ':') {
      j++;
      while (j < filtersBody.length && /[ \t\n]/.test(filtersBody[j])) j++;
      const rest = filtersBody.slice(j);

      // function expression
      const fnMatch = /^function\s*\(([^)]*)\)\s*\{/.exec(rest);
      if (fnMatch) {
        const { body, end } = extractBody(rest, fnMatch[0].length - 1);
        names.push(name); decls.push(`function ${name}(${fnMatch[1]}) {${body}}`);
        i = j + end; continue;
      }

      // arrow function or any other value expression
      let vDepth = 0; let vEnd = 0;
      while (vEnd < rest.length) {
        const vc = rest[vEnd];
        if (vc === '"' || vc === "'" || vc === '`') {
          const q = vc; vEnd++;
          while (vEnd < rest.length && rest[vEnd] !== q) { if (rest[vEnd] === '\\') vEnd++; vEnd++; }
          vEnd++; continue;
        }
        if (vc === '{' || vc === '[' || vc === '(') vDepth++;
        else if (vc === '}' || vc === ']' || vc === ')') { if (vDepth === 0) break; vDepth--; }
        else if (vc === ',' && vDepth === 0) break;
        vEnd++;
      }
      const valueStr = rest.slice(0, vEnd).trim();
      if (valueStr) { names.push(name); decls.push(`const ${name} = ${valueStr}`); }
      i = j + vEnd + (rest[vEnd] === ',' ? 1 : 0); continue;
    }

    i++;
  }

  return { names, decls };
}

/** Extracts mixin names from a value like "[MyMixin, OtherMixin]". */
function parseMixinNames(value: string): string[] {
  const inner = value.replace(/^\[|\]$/g, '').trim();
  if (!inner) return [];
  return inner.split(',').map(s => s.trim()).filter(Boolean);
}

/** Converts `{{ value | filter }}` pipe syntax to `{{ filter(value) }}`. Handles chained pipes. */
function convertTemplateFilters(template: string): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    if (!expr.includes('|')) return match;
    const parts = expr.split('|').map((s: string) => s.trim());
    let result = parts[0];
    for (let fi = 1; fi < parts.length; fi++) result = `${parts[fi]}(${result})`;
    return `{{ ${result} }}`;
  });
}

/**
 * Processes a @Component options body, dismantling each key by its role:
 * - name / inheritAttrs → defineOptions
 * - model → defineModel()
 * - components → removed (async entries become defineAsyncComponent)
 * - directives → removed
 * - filters → standalone functions
 * - mixins → composable placeholder + TODO comment
 */
function processComponentOptions(optBody: string): {
  defineOptsStr: string;
  extraDecls: string[];
  needsDefineAsyncComponent: boolean;
} {
  let body = optBody;
  const extraDecls: string[] = [];
  let needsDefineAsyncComponent = false;

  // name, inheritAttrs → defineOptions
  const defineOptsEntries: string[] = [];
  for (const key of ['name', 'inheritAttrs']) {
    const found = findComponentProp(body, key);
    if (found) {
      defineOptsEntries.push(`  ${key}: ${found.value}`);
      body = body.slice(0, found.start) + body.slice(found.end);
    }
  }

  // model: { prop, event } → defineModel
  const modelProp = findComponentProp(body, 'model');
  if (modelProp) {
    const propMatch = modelProp.value.match(/prop\s*:\s*['"`](\w+)['"`]/);
    const propName = propMatch ? propMatch[1] : 'modelValue';
    extraDecls.push(`const ${propName} = defineModel()`);
    body = body.slice(0, modelProp.start) + body.slice(modelProp.end);
  }

  // components → remove; inline async entries become defineAsyncComponent
  const componentsProp = findComponentProp(body, 'components');
  if (componentsProp) {
    const compBody = componentsProp.value.replace(/^\{|\}$/g, '');
    const asyncEntryRe = /(\w+)\s*:\s*(\(\s*\)\s*=>\s*import\([^)]+\))/g;
    let m: RegExpExecArray | null;
    while ((m = asyncEntryRe.exec(compBody)) !== null) {
      extraDecls.push(`const ${m[1]} = defineAsyncComponent(${m[2]})`);
      needsDefineAsyncComponent = true;
    }
    body = body.slice(0, componentsProp.start) + body.slice(componentsProp.end);
  }

  // directives → remove entirely
  const directivesProp = findComponentProp(body, 'directives');
  if (directivesProp) {
    body = body.slice(0, directivesProp.start) + body.slice(directivesProp.end);
  }

  // filters → standalone functions
  const filtersProp = findComponentProp(body, 'filters');
  if (filtersProp) {
    const filtersInner = filtersProp.value.replace(/^\{|\}$/g, '').trim();
    const { decls: filterDecls } = parseFiltersToFunctions(filtersInner);
    extraDecls.push(...filterDecls);
    body = body.slice(0, filtersProp.start) + body.slice(filtersProp.end);
  }

  // mixins → composable placeholders
  const mixinsProp = findComponentProp(body, 'mixins');
  if (mixinsProp) {
    for (const mixin of parseMixinNames(mixinsProp.value)) {
      extraDecls.push(`// TODO: Refactor ${mixin} into a composable\nconst { } = use${mixin}() // placeholder`);
    }
    body = body.slice(0, mixinsProp.start) + body.slice(mixinsProp.end);
  }

  const defineOptsStr = defineOptsEntries.length > 0
    ? `defineOptions({\n${defineOptsEntries.join(',\n')}\n})`
    : '';

  return { defineOptsStr, extraDecls, needsDefineAsyncComponent };
}

// ─── Internal orchestrator ────────────────────────────────────────────────────

function convertScriptContent(scriptContent: string): string {
  // ── 1. Locate the class declaration ─────────────────────────────────────────
  const classMatch = scriptContent.match(/export default class \w+[^{]*\{/);
  if (!classMatch || classMatch.index === undefined) { return scriptContent; }

  const classIdx = classMatch.index;
  const openBrace = classIdx + classMatch[0].length - 1;
  const { body } = extractBody(scriptContent, openBrace);

  // ── 2. Process preamble (everything before the class declaration) ────────────
  let preamble = scriptContent.slice(0, classIdx);

  // 2a. Extract @Component options, remove decorator, process each property
  let defineOptsStr = '';
  let componentExtraDecls: string[] = [];
  const decoratorMatch = preamble.match(/@Component\s*\(/);
  if (decoratorMatch && decoratorMatch.index !== undefined) {
    const openParenIdx = decoratorMatch.index + decoratorMatch[0].length - 1;
    const openBraceIdx = preamble.indexOf('{', openParenIdx);
    if (openBraceIdx !== -1) {
      const { body: optBody, end: optEnd } = extractBody(preamble, openBraceIdx);
      if (optBody.trim()) {
        const processed = processComponentOptions(optBody);
        defineOptsStr = processed.defineOptsStr;
        componentExtraDecls = processed.extraDecls;
      }
      let pos = optEnd;
      while (pos < preamble.length && preamble[pos] !== '\n') { pos++; }
      if (pos < preamble.length) { pos++; }
      preamble = preamble.slice(0, decoratorMatch.index) + preamble.slice(pos);
    }
  } else if (/@Component\b/.test(preamble)) {
    preamble = preamble.replace(/@Component\s*\n?/, '');
  }

  // Convert preamble-level async component shorthands: const X = () => import(...) → defineAsyncComponent
  preamble = preamble.replace(
    /\bconst\s+(\w+)\s*=\s*\(\s*\)\s*=>\s*import\(([^)]+)\)/g,
    'const $1 = defineAsyncComponent(() => import($2))',
  );

  // 2b. Remove Vue 2 / decorator-library imports; keep everything else
  preamble = preamble
    .replace(/^import\s[\s\S]*?from\s+['"]vue-property-decorator['"]\s*;?\n?/gm, '')
    .replace(/^import\s[\s\S]*?from\s+['"]vuex-class['"]\s*;?\n?/gm, '')
    .replace(/^import\s+Vue\s+from\s+['"]vue['"]\s*;?\n?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // ── 3. Convert class body ────────────────────────────────────────────────────
  let result = body;
  result = convertVuex(result);
  result = convertRefs(result);
  result = convertModel(result);
  result = convertPropSync(result);
  result = convertProps(result);
  result = convertEmitDecorator(result);
  result = convertEmits(result);
  result = convertWatch(result);
  result = convertLifecycle(result);
  result = convertComputed(result);
  result = convertMethod(result);
  result = convertDataFields(result);

  // Fallback for remaining bare data fields
  result = result.replace(
    /^([ \t]*)(\w+)\s*=\s*([^;\n]+?)\s*;?\s*$/gm,
    (_f, indent, name, value) => {
      const wrapper = isComplexType(undefined, value.trim()) ? 'reactive' : 'ref';
      return `${indent}const ${name} = ${wrapper}(${value.trim()})`;
    },
  );

  result = result.replace(/\bthis\.\$emit\(/g, 'emit(');
  result = result.replace(/\bthis\.\$refs\.(\w+)/g, '$1.value');
  result = result.replace(/\bthis\.\$route\b/g, 'route');
  result = result.replace(/\bthis\.\$router\b/g, 'router');
  result = result.replace(/\bthis\.\$store\b/g, 'store');
  result = result.replace(/\bthis\./g, '');
  result = result.replace(/\n{3,}/g, '\n\n');

  // ── 4. Build auto-import lines ───────────────────────────────────────────────
  const allConverted = result + '\n' + defineOptsStr + '\n' + componentExtraDecls.join('\n') + '\n' + preamble;

  const vueApis = detectVue3Imports(allConverted);
  const hasExistingVueImport = /from\s+['"]vue['"]/.test(preamble);
  const vueImportLine = vueApis.length > 0 && !hasExistingVueImport
    ? `import { ${vueApis.join(', ')} } from 'vue'`
    : '';

  const needsVuex = /\buseStore\s*\(/.test(allConverted);
  const hasExistingVuexImport = /from\s+['"]vuex['"]/.test(preamble);
  const vuexImportLine = needsVuex && !hasExistingVuexImport
    ? `import { useStore } from 'vuex'`
    : '';

  // ── 5. Assemble final output ─────────────────────────────────────────────────
  const sections = [
    vueImportLine,
    vuexImportLine,
    preamble,
    ...componentExtraDecls,
    defineOptsStr,
    `// === Vue 3 <script setup> Migration ===\n\n` + result.trim(),
  ].filter(Boolean);

  return sections.join('\n\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts a full Vue 2 class component.
 * When given a complete SFC (.vue file), only the <script> block is transformed;
 * <template> and <style> blocks are preserved verbatim.
 * Order: convertComponent → all class-body converters.
 */
export function convertFullClass(text: string): string {
  const scriptTagMatch = text.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  if (!scriptTagMatch) {
    return convertScriptContent(text);
  }

  const scriptStart = text.indexOf(scriptTagMatch[0]);
  const templateBlock = text.slice(0, scriptStart).trim();
  const styleBlock = text.slice(scriptStart + scriptTagMatch[0].length).trim();

  const scriptAttrs = scriptTagMatch[1];
  const scriptContent = scriptTagMatch[2];
  const converted = convertScriptContent(scriptContent);

  const langMatch = scriptAttrs.match(/lang=["'](\w+)["']/);
  const lang = langMatch ? langMatch[1] : 'ts';
  const newScript = `<script setup lang="${lang}">\n${converted}\n</script>`;
  const convertedTemplate = convertTemplateFilters(templateBlock);

  return [convertedTemplate, newScript, styleBlock].filter(Boolean).join('\n\n');
}

/**
 * Dismantles @Component({...}) according to per-key rules:
 * - name / inheritAttrs → defineOptions({...})
 * - model → defineModel()
 * - components / directives → removed (async inline entries become defineAsyncComponent)
 * - filters → standalone functions
 * - mixins → composable placeholders with TODO comments
 */
export function convertComponent(text: string): string {
  const decoratorMatch = text.match(/@Component\s*\(/);

  if (!decoratorMatch || decoratorMatch.index === undefined) {
    return text.replace(/@Component\b\s*\n?/, '').trim();
  }

  const openParenIdx = decoratorMatch.index + decoratorMatch[0].length - 1;
  const openBraceIdx = text.indexOf('{', openParenIdx);

  if (openBraceIdx === -1) {
    return text.replace(/@Component\s*\(\s*\)\s*\n?/, '').trim();
  }

  const { body, end } = extractBody(text, openBraceIdx);

  let pos = end;
  while (pos < text.length && text[pos] !== '\n') { pos++; }
  if (pos < text.length) { pos++; }

  const { defineOptsStr, extraDecls } = processComponentOptions(body);
  const before = text.slice(0, decoratorMatch.index).trim();
  const after = text.slice(pos).trim();

  return [before, ...extraDecls, defineOptsStr, after].filter(Boolean).join('\n\n');
}

/** Converts @Prop decorators — handles public/private/protected modifiers. */
export function convertProps(text: string): string {
  const propRegex =
    /@Prop\(((?:[^()]*|\([^)]*\))*)\)\s+(?:(?:public|private|protected)\s+)?(?:readonly\s+)?(\w+)[!?]?\s*:\s*([^;\n]+);/g;

  const props: Array<{ name: string; tsType: string; required: boolean; defaultValue?: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(text)) !== null) {
    const [, options, name, tsType] = match;
    const isRequired = /required:\s*true/.test(options);
    const hasDefault = /\bdefault\s*:/.test(options);
    let defaultValue: string | undefined;
    if (hasDefault) {
      const dm = options.match(/\bdefault\s*:\s*((?:'[^']*'|"[^"]*"|`[^`]*`|\([^)]*\)|\[[^\]]*\]|[^,}])+)/);
      if (dm) { defaultValue = dm[1].trim(); }
    }
    props.push({ name, tsType: tsType.trim(), required: isRequired, defaultValue });
  }

  if (props.length === 0) {
    return `const props = defineProps<{}>()\n\n` + text;
  }

  const propLines = props
    .map(p => {
      const optional = !p.required && p.defaultValue === undefined;
      return `  ${p.name}${optional ? '?' : ''}: ${p.tsType};`;
    })
    .join('\n');

  const withDefaults = props.filter(p => p.defaultValue !== undefined);
  let definePropsStr: string;
  if (withDefaults.length > 0) {
    const defaultsStr = withDefaults.map(p => `  ${p.name}: ${p.defaultValue}`).join(',\n');
    definePropsStr = `const props = withDefaults(defineProps<{\n${propLines}\n}>(), {\n${defaultsStr}\n})`;
  } else {
    definePropsStr = `const props = defineProps<{\n${propLines}\n}>()`;
  }

  const cleaned = text
    .replace(
      /@Prop\((?:[^()]*|\([^)]*\))*\)\s+(?:(?:public|private|protected)\s+)?(?:readonly\s+)?\w+[!?]?\s*:\s*[^;\n]+;\n?/g,
      '',
    )
    .trim();

  return definePropsStr + '\n\n' + cleaned;
}

/** Converts @PropSync('prop') var!: T  →  const var = defineModel<T>('prop') */
export function convertPropSync(text: string): string {
  const pattern =
    /@PropSync\(\s*['"`](\w+)['"`](?:\s*,\s*(?:\{[^}]*\}))?\s*\)\s+(?:(?:public|private|protected)\s+)?(?:readonly\s+)?(\w+)[!?]?\s*:\s*([^;\n]+);/g;
  const decls: string[] = [];

  const result = text.replace(pattern, (_f, propName, varName, tsType) => {
    decls.push(`const ${varName} = defineModel<${tsType.trim()}>('${propName}')`);
    return '';
  });

  if (decls.length === 0) { return text; }
  return decls.join('\n') + '\n\n' + result.trim();
}

/** Converts @Model('event', { type: T }) value!: T  →  const value = defineModel<T>() */
export function convertModel(text: string): string {
  const pattern =
    /@Model\(\s*['"`][\w:]+['"`](?:\s*,\s*(?:\{[^}]*\}))?\s*\)\s+(?:(?:public|private|protected)\s+)?(?:readonly\s+)?(\w+)[!?]?\s*:\s*([^;\n]+);/g;
  const decls: string[] = [];

  const result = text.replace(pattern, (_f, varName, tsType) => {
    decls.push(`const ${varName} = defineModel<${tsType.trim()}>()`);
    return '';
  });

  if (decls.length === 0) { return text; }
  return decls.join('\n') + '\n\n' + result.trim();
}

/** Scans for this.$emit() calls and builds a defineEmits declaration. */
export function convertEmits(text: string): string {
  const emitRegex = /\bthis\.\$emit\(\s*['"`]([\w-]+)['"`]/g;
  const emitNames = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = emitRegex.exec(text)) !== null) {
    emitNames.add(match[1]);
  }
  if (emitNames.size === 0) { return text; }
  const lines = [...emitNames].map(n => `  (e: '${n}', ...args: any[]): void`).join('\n');
  return `const emit = defineEmits<{\n${lines}\n}>()\n\n` + text;
}

/**
 * Converts @Emit('name') / @Emit() decorated methods.
 * `return expr` inside the body is replaced with emit('event', expr).
 * If there is no return, emit is appended using the parameter names.
 */
export function convertEmitDecorator(text: string): string {
  const pattern =
    /@Emit\(\s*(?:['"`]([\w-]+)['"`])?\s*\)(?:\s*\/\/[^\n]*)?\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*[^{]+)?\s*\{/g;

  const decls: string[] = [];
  const emitEvents: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, eventName, methodName, params] = match;
    const openBrace = match.index + fullMatch.length - 1;
    const { body, end } = extractBody(text, openBrace);

    const event = eventName ?? toKebabCase(methodName);
    emitEvents.push(event);

    const paramNames = params
      .split(',')
      .map(p => p.trim().split(/[\s:]/)[0].replace(/[!?]/g, '').trim())
      .filter(Boolean);

    const hasReturn = /\breturn\b/.test(body);
    let newBody: string;
    if (hasReturn) {
      newBody = body.replace(/\breturn\s+([^;\n]+)\s*;?/g, (_, val) =>
        `emit('${event}', ${val.trim()})`,
      );
    } else {
      const emitArgs = paramNames.length > 0 ? `, ${paramNames.join(', ')}` : '';
      newBody = body.trimEnd() + `\n  emit('${event}'${emitArgs})`;
    }

    const isAsync = fullMatch.includes('async');
    decls.push(`const ${methodName} = ${isAsync ? 'async ' : ''}(${params}) => {${newBody}\n}`);
    segments.push({ start: match.index, end });
  }

  if (decls.length === 0) { return text; }

  const emitLines = emitEvents.map(e => `  (e: '${e}', ...args: any[]): void`).join('\n');
  const defineEmitsStr = `const emit = defineEmits<{\n${emitLines}\n}>()`;

  let result = text;
  for (let i = segments.length - 1; i >= 0; i--) {
    result = result.slice(0, segments[i].start) + result.slice(segments[i].end);
  }
  return defineEmitsStr + '\n\n' + decls.join('\n\n') + '\n\n' + result.trim();
}

export function convertComputed(text: string): string {
  const pattern = /\bget\s+(\w+)\s*\(\s*\)(?:\s*:\s*[^{]+)?\s*\{/g;
  const decls: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const openBrace = match.index + match[0].length - 1;
    const { body, end } = extractBody(text, openBrace);
    decls.push(`const ${match[1]} = computed(() => {${body}})`);
    segments.push({ start: match.index, end });
  }

  if (decls.length === 0) { return text; }

  let result = text;
  for (let i = segments.length - 1; i >= 0; i--) {
    result = result.slice(0, segments[i].start) + result.slice(segments[i].end);
  }
  return decls.join('\n\n') + '\n\n' + result.trim();
}

export function convertWatch(text: string): string {
  const pattern =
    /@Watch\(\s*['"`]([\w.]+)['"`](?:\s*,\s*(\{[^}]*\}))?\s*\)\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*[^{]+)?\s*\{/g;
  const decls: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [, watchProp, optStr, , params] = match;
    const openBrace = match.index + match[0].length - 1;
    const { body, end } = extractBody(text, openBrace);

    const options: string[] = [];
    if (optStr) {
      if (/immediate\s*:\s*true/.test(optStr)) { options.push('immediate: true'); }
      if (/deep\s*:\s*true/.test(optStr)) { options.push('deep: true'); }
    }
    const optPart = options.length ? `, { ${options.join(', ')} }` : '';
    decls.push(`watch(() => ${watchProp}, (${params}) => {${body}}${optPart})`);
    segments.push({ start: match.index, end });
  }

  if (decls.length === 0) { return text; }

  let result = text;
  for (let i = segments.length - 1; i >= 0; i--) {
    result = result.slice(0, segments[i].start) + result.slice(segments[i].end);
  }
  return decls.join('\n\n') + '\n\n' + result.trim();
}

export function convertMethod(text: string): string {
  const pattern =
    /\n([ \t]*)(?:(?:public|private|protected)\s+)?(?!get\s+|set\s+|constructor\s*\()(?:(async)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*[^{\n]+)?\s*\{/g;
  const decls: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [, , asyncKw, name, params] = match;
    if (SKIP_KEYWORDS.has(name)) { continue; }
    const openBrace = match.index + match[0].length - 1;
    const { body, end } = extractBody(text, openBrace);
    const asyncPrefix = asyncKw ? 'async ' : '';
    decls.push(`const ${name} = ${asyncPrefix}(${params}) => {${body}}`);
    segments.push({ start: match.index, end });
  }

  if (decls.length === 0) { return text; }

  let result = text;
  for (let i = segments.length - 1; i >= 0; i--) {
    result = result.slice(0, segments[i].start) + result.slice(segments[i].end);
  }
  return decls.join('\n\n') + '\n\n' + result.trim();
}

/**
 * Converts lifecycle hooks.
 * beforeCreate / created: inlined directly (setup IS the setup function).
 * All others: wrapped in their onXxx() counterpart.
 */
export function convertLifecycle(text: string): string {
  const allNames = [...Object.keys(LIFECYCLE_MAP), ...INLINE_LIFECYCLE_HOOKS].join('|');
  const pattern = new RegExp(`\\b(?:async\\s+)?(${allNames})\\s*\\(\\s*\\)(?:\\s*:\\s*[^{]+)?\\s*\\{`, 'g');
  const decls: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const hookName = match[1];
    const openBrace = match.index + match[0].length - 1;
    const { body, end } = extractBody(text, openBrace);

    if (INLINE_LIFECYCLE_HOOKS.has(hookName)) {
      decls.push(body.trim());
    } else {
      decls.push(`${LIFECYCLE_MAP[hookName]}(() => {${body}})`);
    }
    segments.push({ start: match.index, end });
  }

  if (decls.length === 0) { return text; }

  let result = text;
  for (let i = segments.length - 1; i >= 0; i--) {
    result = result.slice(0, segments[i].start) + result.slice(segments[i].end);
  }
  return decls.join('\n\n') + '\n\n' + result.trim();
}

/** Converts @Ref('name') — uses the string inside @Ref(...) as the variable name. */
export function convertRefs(text: string): string {
  const pattern =
    /@Ref\(\s*(?:['"`](\w+)['"`])?\s*\)\s*(?:(?:public|private|protected)\s+)?(?:readonly\s+)?(\w+)[!?]?\s*:\s*([^;\n]+);/g;
  const decls: string[] = [];

  const result = text.replace(pattern, (_f, refName, propName, tsType) => {
    const varName = refName ?? propName;
    decls.push(`const ${varName} = ref<${tsType.trim()} | null>(null)`);
    return '';
  });

  if (decls.length === 0) { return text; }
  return decls.join('\n') + '\n\n' + result.trim();
}

export function convertVuex(text: string): string {
  const statePattern =
    /@State(?:\(\s*(?:['"`](\w+)['"`])?\s*\))?\s*(?:readonly\s+)?(\w+)[!?]?\s*:\s*[^;\n]+;/g;
  const getterPattern =
    /@Getter(?:\(\s*(?:['"`](\w+)['"`])?\s*\))?\s*(?:readonly\s+)?(\w+)[!?]?\s*:\s*[^;\n]+;/g;
  const actionPattern =
    /@Action(?:\(\s*(?:['"`](\w+)['"`])?\s*\))?\s*(?:readonly\s+)?(\w+)[!?]?\s*:\s*[^;\n]+;/g;
  const mutationPattern =
    /@Mutation(?:\(\s*(?:['"`](\w+)['"`])?\s*\))?\s*(?:readonly\s+)?(\w+)[!?]?\s*:\s*[^;\n]+;/g;

  const decls: string[] = [];
  let hasVuex = false;
  let result = text;

  result = result.replace(statePattern, (_f, key, name) => {
    hasVuex = true;
    decls.push(`const ${name} = computed(() => store.state.${key ?? name})`);
    return '';
  });
  result = result.replace(getterPattern, (_f, key, name) => {
    hasVuex = true;
    decls.push(`const ${name} = computed(() => store.getters['${key ?? name}'])`);
    return '';
  });
  result = result.replace(actionPattern, (_f, key, name) => {
    hasVuex = true;
    decls.push(`const ${name} = (...args: any[]) => store.dispatch('${key ?? name}', ...args)`);
    return '';
  });
  result = result.replace(mutationPattern, (_f, key, name) => {
    hasVuex = true;
    decls.push(`const ${name} = (...args: any[]) => store.commit('${key ?? name}', ...args)`);
    return '';
  });

  if (!hasVuex) { return text; }
  return `const store = useStore()\n` + decls.join('\n') + '\n\n' + result.trim();
}

/** Converts class data fields with access modifiers or type annotations to ref/reactive. */
export function convertDataFields(text: string): string {
  const fieldStart =
    /^([ \t]*)(?:(public|private|protected)\s+)?(?:(readonly)\s+)?(\w+)[!?]?(?:\s*:\s*([^=;\n]+?))?\s*=\s*/gm;

  const decls: string[] = [];
  const segments: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = fieldStart.exec(text)) !== null) {
    const [fullStart, indent, accessMod, readonlyMod, name, tsType] = match;
    if (!accessMod && !readonlyMod && !tsType) { continue; }

    const valueStart = match.index + fullStart.length;
    const firstChar = text[valueStart];

    let initValue: string;
    let end: number;

    if (firstChar === '{' || firstChar === '[') {
      const closeChar = firstChar === '{' ? '}' : ']';
      let depth = 1;
      let i = valueStart + 1;
      while (i < text.length && depth > 0) {
        if (text[i] === firstChar) { depth++; }
        else if (text[i] === closeChar) { depth--; }
        i++;
      }
      initValue = text.slice(valueStart, i);
      end = i + (text[i] === ';' ? 1 : 0);
    } else {
      const rest = text.slice(valueStart);
      const lineEnd = rest.search(/[;\n]/);
      if (lineEnd === -1) { continue; }
      initValue = rest.slice(0, lineEnd).trim();
      end = valueStart + lineEnd + (rest[lineEnd] === ';' ? 1 : 0);
    }

    const wrapper = isComplexType(tsType?.trim(), initValue) ? 'reactive' : 'ref';
    decls.push(`${indent}const ${name} = ${wrapper}(${initValue})`);
    segments.push({ start: match.index, end });
  }

  if (decls.length === 0) { return text; }

  let result = text;
  for (let i = segments.length - 1; i >= 0; i--) {
    result = result.slice(0, segments[i].start) + result.slice(segments[i].end);
  }
  return decls.join('\n') + '\n\n' + result.trim();
}
