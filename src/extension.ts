import * as vscode from 'vscode';
import * as migrator from './migrator';

/**
 * Interface for our command structure to keep metadata in one place
 */
interface MigrationCommand {
  id: string;
  label: string;
  detail: string;
  pattern?: string; // Used to trigger the lightbulb
  fn: (text: string) => string;
}

export function activate(context: vscode.ExtensionContext) {
  // 1. Define all migration options and sort them alphabetically by label
  const migrationCommands: MigrationCommand[] = [
    {
      id: 'vue-migrate.convertComponent',
      label: 'Component Decorator',
      detail: 'Migrate @Component to defineOptions',
      pattern: '@Component',
      fn: migrator.convertComponent,
    },
    {
      id: 'vue-migrate.convertComputed',
      label: 'Computed',
      detail: 'Migrate Computed Properties',
      pattern: 'get ',
      fn: migrator.convertComputed,
    },
    {
      id: 'vue-migrate.convertDataFields',
      label: 'Data Fields',
      detail: 'Migrate Class Data to ref/reactive',
      fn: migrator.convertDataFields,
    },
    {
      id: 'vue-migrate.convertEmitDecorator',
      label: 'Emit Decorator',
      detail: 'Migrate @Emit on methods',
      pattern: '@Emit',
      fn: migrator.convertEmitDecorator,
    },
    {
      id: 'vue-migrate.convertEmits',
      label: 'Emits',
      detail: 'Migrate Emits',
      fn: migrator.convertEmits,
    },
    {
      id: 'vue-migrate.convertFull',
      label: 'Full Migration',
      detail: 'Convert Full Class to Composition API',
      pattern: 'export default class',
      fn: migrator.convertFullClass,
    },
    {
      id: 'vue-migrate.convertLifecycle',
      label: 'Lifecycle',
      detail: 'Migrate Lifecycle Hooks',
      fn: migrator.convertLifecycle,
    },
    {
      id: 'vue-migrate.convertMethod',
      label: 'Methods',
      detail: 'Migrate Methods',
      fn: migrator.convertMethod,
    },
    {
      id: 'vue-migrate.convertModel',
      label: 'Model',
      detail: 'Migrate @Model to defineModel',
      pattern: '@Model',
      fn: migrator.convertModel,
    },
    {
      id: 'vue-migrate.convertProps',
      label: 'Props',
      detail: 'Migrate @Prop',
      pattern: '@Prop',
      fn: migrator.convertProps,
    },
    {
      id: 'vue-migrate.convertPropSync',
      label: 'PropSync',
      detail: 'Migrate @PropSync to defineModel',
      pattern: '@PropSync',
      fn: migrator.convertPropSync,
    },
    {
      id: 'vue-migrate.convertRefs',
      label: 'Refs',
      detail: 'Migrate Template Refs (@Ref)',
      pattern: '@Ref',
      fn: migrator.convertRefs,
    },
    {
      id: 'vue-migrate.convertVuex',
      label: 'Vuex',
      detail: 'Migrate Vuex Decorators',
      fn: migrator.convertVuex,
    },
    {
      id: 'vue-migrate.convertWatch',
      label: 'Watchers',
      detail: 'Migrate @Watch',
      pattern: '@Watch',
      fn: migrator.convertWatch,
    },
  ].sort((a, b) => a.label.localeCompare(b.label));

  // 2. Register individual commands (used by Menu, Quick Pick, and Lightbulb)
  migrationCommands.forEach(({ id, fn }) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const doc = editor.document;
        if (doc.languageId !== 'vue') {
          vscode.window.showErrorMessage(
            'Vue Migration Helper only works in .vue files',
          );
          return;
        }

        const selection = editor.selection;
        const text = selection.isEmpty ? doc.getText() : doc.getText(selection);

        try {
          const result = fn(text);
          const edit = new vscode.WorkspaceEdit();

          // Determine range: replace selection or whole file
          let range: vscode.Range;
          if (selection.isEmpty) {
            const lastLine = doc.lineAt(doc.lineCount - 1);
            range = new vscode.Range(
              new vscode.Position(0, 0),
              lastLine.range.end,
            );
          } else {
            range = selection;
          }

          edit.replace(doc.uri, range, result);
          await vscode.workspace.applyEdit(edit);

          // Subtle status bar notification
          vscode.window.setStatusBarMessage(
            `Successfully applied: ${id.split('.').pop()}`,
            3000,
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Migration failed: ${error}`);
        }
      }),
    );
  });

  // 3. Register the Master Quick Pick Menu (Ctrl+Shift+V)
  context.subscriptions.push(
    vscode.commands.registerCommand('vue-migrate.showMenu', async () => {
      const selection = await vscode.window.showQuickPick(migrationCommands, {
        placeHolder: 'Select a Vue migration action...',
        matchOnDetail: true,
      });

      if (selection) {
        vscode.commands.executeCommand(selection.id);
      }
    }),
  );

  // 4. Register the Lightbulb (Code Action Provider)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      'vue',
      new VueMigratorProvider(migrationCommands),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite],
      },
    ),
  );
}

/**
 * Class to provide "Lightbulb" suggestions based on text context
 */
class VueMigratorProvider implements vscode.CodeActionProvider {
  constructor(private commands: MigrationCommand[]) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const lineText = document.lineAt(range.start.line).text;

    // Check each command to see if its pattern exists on the current line
    this.commands.forEach((cmd) => {
      if (cmd.pattern && lineText.includes(cmd.pattern)) {
        const action = new vscode.CodeAction(
          `✨ Migrate ${cmd.label}`,
          vscode.CodeActionKind.RefactorRewrite,
        );
        action.command = {
          command: cmd.id,
          title: cmd.label,
        };
        // Make it a preferred action if it's a specific decorator
        action.isPreferred = true;
        actions.push(action);
      }
    });

    return actions;
  }
}

export function deactivate() {}
