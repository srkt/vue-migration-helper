<template>
  <div class="test-component">
    <h1>{{ title }}</h1>
    <p>Computed: {{ fullName }}</p>
    <button @click="handleAsyncAction">Trigger Emit</button>

    <canvas ref="chartCanvas"></canvas>

    <sync-child />
    <async-child v-if="showAsync" />
  </div>
</template>

<script lang="ts">
import {
  Component,
  Prop,
  Vue,
  Watch,
  Ref,
  Model,
  Emit,
  PropSync,
} from 'vue-property-decorator';
import { State, Action, Getter } from 'vuex-class';
import SyncChild from './SyncChild.vue';
import MyMixin from './MyMixin';

// Async component import
const AsyncChild = () => import('./AsyncChild.vue');

@Component({
  components: {
    SyncChild,
    AsyncChild,
  },
  mixins: [MyMixin],
})
export default class TestMigrationComponent extends Vue {
  // 1. Props & Models
  @Prop({ type: String, default: 'Default Title' }) readonly title!: string;
  @Prop({ type: Number }) private count?: number;

  @Model('change', { type: Boolean }) checked!: boolean;

  // 2. PropSync (Two-way binding)
  @PropSync('active', { type: Boolean }) syncedActive!: boolean;

  // 3. Data (Class Properties)
  private showAsync: boolean = false;
  public list: string[] = ['item1', 'item2'];

  // 4. Refs
  @Ref('chartCanvas') readonly canvas!: HTMLCanvasElement;

  // 5. Vuex Decorators
  @State('user') userState: any;
  @Getter('isLoggedIn') loggedIn!: boolean;
  @Action('fetchData') dispatchFetchData: any;

  // 6. Computed Properties
  get fullName(): string {
    return `${this.userState?.firstName || 'Guest'} User`;
  }

  // 7. Watchers
  @Watch('count', { immediate: true, deep: true })
  onCountChanged(val: number, oldVal: number) {
    console.log(`Count changed from ${oldVal} to ${val}`);
  }

  // 8. Lifecycle Hooks
  async created() {
    console.log('Component Created');
    await this.dispatchFetchData();
  }

  mounted() {
    console.log('Mounted with Ref:', this.canvas);
  }

  // 9. Methods & Emits
  @Emit('submit')
  handleAsyncAction() {
    this.showAsync = !this.showAsync;
    return { status: 'success', timestamp: Date.now() };
  }

  @Emit() // Inferred event name: 'manual-trigger'
  manualTrigger(id: number) {
    return id;
  }

  private async internalHelper(): Promise<void> {
    const response = await fetch('/api/test');
    console.log(response.ok);
  }
}
</script>

<style scoped>
.test-component {
  padding: 20px;
}
</style>
