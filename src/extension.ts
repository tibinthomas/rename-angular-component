// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { FileHandle } from 'fs/promises';
import { FileInfoResult } from 'prettier';
import * as vscode from 'vscode';
import { rename } from './helpers/rename.function';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "rename-angular-component" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let renameComponent = vscode.commands.registerCommand(
    'rename-angular-component.renameComponent',
    (uri: vscode.Uri) => rename('component', uri)
  );
  context.subscriptions.push(renameComponent);

  let renameDirective = vscode.commands.registerCommand(
    'rename-angular-component.renameDirective',
    (uri: vscode.Uri) => rename('directive', uri)
  );
  context.subscriptions.push(renameDirective);

  let renameService = vscode.commands.registerCommand(
    'rename-angular-component.renameService',
    (uri: vscode.Uri) => rename('service', uri)
  );
  context.subscriptions.push(renameService);
}

// this method is called when your extension is deactivated
export function deactivate() {}
