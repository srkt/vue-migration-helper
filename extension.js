import * as vscode from 'vscode';
import * as migrator from './migrator';

export function activate(context: vscode.ExtensionContext) {
  const commands = [
    { id: 'vue-migrate.convertFull', fn: migrator.convertFullClass },
    { id: 'vue-migrate.convertProps', fn: migrator.convertProps },
    { id: 'vue-migrate.convertEmits', fn: migrator.convertEmits },
    { id: 'vue-migrate.convertComputed', fn: migrator.convertComputed },
    { id: 'vue-migrate.convertWatch', fn: migrator.convertWatch },
    { id: 'vue-migrate.convertMethod', fn: migrator.convertMethod },
    { id: 'vue-migrate.convertLifecycle', fn: migrator.convertLifecycle },
    { id: 'vue-migrate.convertRefs', fn: migrator.convertRefs },
    { id: 'vue-migrate.convertVuex', fn: migrator.convertVuex },
  ];

  commands.forEach(({ id, fn }) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const doc = editor.document;
        if (doc.languageId !== 'vue') {
          vscode.window.showErrorMessage('Please open a .vue file');
          return;
        }

        const selection = editor.selection;
        const text = selection.isEmpty ? doc.getText() : doc.getText(selection);
        const result = fn(text);

        const edit = new vscode.WorkspaceEdit();
        const range = selection.isEmpty 
          ? new vscode.Range(0, 0, doc.lineCount, 0) 
          : selection;

        edit.replace(doc.uri, range, result);
        await vscode.workspace.applyEdit(edit);

        vscode.window.showInformationMessage(`Migration applied: ${id}`);
      })
    );
  });

  vscode.window.showInformationMessage('Vue Migration Helper is ready! Right-click in .vue files.');
}

export function deactivate() {}
