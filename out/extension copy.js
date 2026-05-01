"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const migrator = __importStar(require("./migrator"));
function activate(context) {
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
        { id: 'vue-migrate.convertDataFields', fn: migrator.convertDataFields },
        { id: 'vue-migrate.convertComponent', fn: migrator.convertComponent },
        { id: 'vue-migrate.convertPropSync', fn: migrator.convertPropSync },
        { id: 'vue-migrate.convertModel', fn: migrator.convertModel },
        { id: 'vue-migrate.convertEmitDecorator', fn: migrator.convertEmitDecorator },
    ];
    commands.forEach(({ id, fn }) => {
        context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor)
                return;
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
        }));
    });
    vscode.window.showInformationMessage('Vue Migration Helper is ready! Right-click in .vue files.');
}
function deactivate() { }
//# sourceMappingURL=extension%20copy.js.map