# Vue Migration Helper

A VS Code extension for incremental, selective migration of Vue 2 class-based components (using `vue-class-component` / `vue-property-decorator`) to Vue 3 Composition API with `<script setup lang="ts">`.

## Features

- **Selective migration** — run individual converters or migrate the entire component at once
- **Lightbulb code actions** — context-sensitive suggestions appear as you edit
- **Right-click context menu** — access all commands from the editor context menu
- **Quick pick menu** — `Ctrl+Shift+V` opens a searchable command palette
- **Works on selection or full document**

### Supported Conversions

| Command | What it converts |
|---|---|
| Convert Full Component | Runs all converters and wraps output in `<script setup lang="ts">` |
| Convert @Component | `@Component(...)` decorator → `defineOptions()`, `defineModel()`, composable stubs for mixins |
| Convert @Prop | `@Prop` decorators → `defineProps<{}>()` / `withDefaults()` |
| Convert @Model | `@Model` decorator → `defineModel<T>()` |
| Convert @PropSync | `@PropSync` decorator → `defineModel<T>('name')` |
| Convert @Emit | `@Emit` decorated methods → arrow functions calling `emit()` |
| Convert $emit calls | Scans `this.$emit()` calls → `defineEmits<{}>()` |
| Convert Computed | `get prop() {}` getters → `computed(() => ...)` |
| Convert @Watch | `@Watch` decorators → `watch()` composables |
| Convert Methods | Class methods → `const method = () => ...` arrow functions |
| Convert Lifecycle Hooks | Vue 2 hooks → Vue 3 `onXxx()` composables |
| Convert @Ref | `@Ref` decorators → `const ref = ref<T \| null>(null)` |
| Convert Vuex Decorators | `@State`, `@Getter`, `@Action`, `@Mutation` → `useStore()` calls |
| Convert Data Fields | Class properties → `ref()` or `reactive()` based on type |

## Requirements

- VS Code 1.85.0 or higher
- Vue files using `vue-class-component` / `vue-property-decorator` patterns

## Usage

1. Open a `.vue` file that uses class-based components
2. Use any of the following to trigger migration commands:
   - **`Ctrl+Shift+V`** — open the quick pick menu
   - **Right-click** in the editor → **Vue Migration Helper** submenu
   - **Lightbulb icon** (appears when cursor is on a recognized decorator)
3. Run **"Convert Full Component"** to migrate the entire `<script>` block at once, or run individual converters to migrate incrementally

### Example

**Before (Vue 2 class syntax):**

```vue
<script lang="ts">
import { Component, Prop, Watch } from 'vue-property-decorator'

@Component
export default class MyComponent extends Vue {
  @Prop({ type: String, default: 'world' }) name!: string

  message = 'hello'

  get greeting() {
    return `${this.message}, ${this.name}!`
  }

  @Watch('name')
  onNameChange(val: string) {
    console.log('name changed to', val)
  }
}
</script>
```

**After (Vue 3 `<script setup>`):**

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = withDefaults(defineProps<{
  name: string
}>(), {
  name: 'world'
})

const message = ref('hello')

const greeting = computed(() => `${message.value}, ${props.name}!`)

watch(() => props.name, (val) => {
  console.log('name changed to', val)
})
</script>
```

## Development

### Setup

```bash
npm install
npm run compile
```

### Running the extension

Press `F5` in VS Code to open an Extension Development Host window with the extension loaded.

### Building

```bash
# One-time compile
npm run compile

# Watch mode
npm run watch
```

### Project structure

```
src/
  extension.ts   # VS Code extension entry point — registers commands and code actions
  migrator.ts    # Core transformation logic — all conversion functions live here
samples/
  test.vue       # Complex component covering all supported patterns
  test2.vue      # Simpler component for incremental migration testing
```

## Known Limitations

- Regex-based parsing; deeply nested or unusual formatting may not transform correctly
- Computed **setters** (`set prop(v) {}`) are not converted automatically
- `@Provide` / `@Inject` decorators are not converted
- Mixins are replaced with placeholder composable stubs and a TODO comment
- Always review and test the migrated output before committing

## License

MIT
