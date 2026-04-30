export function convertFullClass(text: string): string {
  let result = text.replace(/@Component\([\s\S]*?\)\s*export default class \w+ extends .*?\{/s, '');
  result = result.replace(/\bthis\./g, '');
  return `// === Vue 3 <script setup> Migration ===\n\n` + result.trim();
}

export function convertProps(text: string): string {
  return `const props = defineProps<{}>()\n\n` + text;
}

export function convertEmits(text: string): string {
  return `const emit = defineEmits<{}>()\n\n` + text;
}

export function convertComputed(text: string): string {
  return `const myComputed = computed(() => {\n  ${text}\n})\n`;
}

export function convertWatch(text: string): string {
  return `watch(source, () => {\n  ${text}\n})\n`;
}

export function convertMethod(text: string): string {
  return `const newMethod = () => {\n  ${text}\n}\n`;
}

export function convertLifecycle(text: string): string {
  return `onMounted(() => {\n  ${text}\n})\n`;
}

export function convertRefs(text: string): string {
  return `const refName = ref(null)\n` + text;
}

export function convertVuex(text: string): string {
  return `const store = useStore()\n` + text;
}
