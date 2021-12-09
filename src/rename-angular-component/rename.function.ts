import * as vscode from 'vscode';
import { pascalCase } from 'pascal-case';
import {
  AngularConstruct,
  OriginalFileDetails,
} from './definitions/file.interfaces';
import { getProjectRoot } from './definitions/get-project-root-file-path.function';
import { ReferenceIndexer } from '../move-ts-indexer/reference-indexer';
import { FileItem } from '../move-ts-indexer/file-item';
import * as fs from 'fs-extra-promise';
import { paramCase } from 'change-case';
import { getOriginalFileDetails } from './inFileEdits/get-original-file-details.function';
import { windowsFilePathFix } from './file-manipulation/windows-file-path-fix.function';
import { FilesRelatedToStub } from './files-related-to-stub.class';
import { findReplaceSelectorsInTemplateFiles } from './file-manipulation/find-replace-selectors-in-template-files.function';
import { createOutputChannel } from './create-output-channel.function';
import { logInfo } from './logging/log-info.function';
import { popupMessage } from './logging/popup-message.function';
import {
  getClassNameEdits,
  getCoreClassEdits,
  SelectorTransfer,
} from './inFileEdits/custom-edits';

export async function rename(
  construct: AngularConstruct,
  uri: vscode.Uri,
  importer: ReferenceIndexer,
  indexerInitialisePromise: Thenable<any>
) {
  const originalFileDetails: Readonly<OriginalFileDetails> =
    getOriginalFileDetails(uri.path);
  const projectRoot = windowsFilePathFix(getProjectRoot(uri) as string);
  const title = `Rename Angular ${pascalCase(construct)}`;

  const inputResult = await vscode.window.showInputBox({
    title,
    prompt: `Enter the new ${construct} name.`,
    value: originalFileDetails.stub,
  });
  const start = Date.now();

  const output = createOutputChannel(title);
  if (!inputResult) {
    popupMessage(`New ${construct} name not entered. Stopped.`);
    return;
  }
  if (originalFileDetails.stub === inputResult) {
    popupMessage(`${pascalCase(construct)} name same as original. Stopped.`);
    return;
  }
  // make sure it's kebab
  const newStub = paramCase(inputResult ?? '');

  const timeoutPause = async (wait = 0) => {
    await new Promise((res) => setTimeout(res, wait));
    return;
  };

  // wait for indexer initialise to complete
  const indexTime = await indexerInitialisePromise;
  logInfo(output, [
    `Index files completed in ${Math.round(indexTime * 100) / 100} seconds`,
    '',
  ]);
  importer.setOutputChannel(output);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: title + ' in progress',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      await timeoutPause();

      try {
        const filesRelatedToStub = await FilesRelatedToStub.init(
          originalFileDetails,
          projectRoot,
          construct
        );

        const filesToMove = filesRelatedToStub.getFilesToMove(
          newStub as string
        );
        const oldClassName = `${pascalCase(
          originalFileDetails.stub
        )}${pascalCase(construct)}`;
        const newClassName = `${pascalCase(newStub)}${pascalCase(construct)}`;

        const selectorTransfer = new SelectorTransfer();

        const fileMoveJobs = filesToMove.map((f) => {
          const additionalEdits = {
            importsEdits: (() =>
              getClassNameEdits(oldClassName, newClassName))(),
            movedFileEdits: f.isCoreConstruct
              ? (() =>
                  getCoreClassEdits(
                    oldClassName,
                    newClassName,
                    originalFileDetails.stub,
                    newStub,
                    construct,
                    selectorTransfer
                  ))()
              : undefined,
          };

          return new FileItem(
            windowsFilePathFix(f.filePath, true),
            windowsFilePathFix(f.newFilePath, true),
            fs.statSync(f.filePath).isDirectory(),
            oldClassName,
            newClassName,
            additionalEdits
          );
        });

        if (fileMoveJobs.some((l) => l.exists())) {
          vscode.window.showErrorMessage(
            'Not allowed to overwrite existing files'
          );
          return;
        }

        progress.report({ increment: 20 });
        await timeoutPause();

        const progressIncrement = Math.floor(70 / fileMoveJobs.length);
        let currentProgress = 20;
        importer.startNewMoves(fileMoveJobs);
        for (const item of fileMoveJobs) {
          currentProgress += progressIncrement;
          progress.report({ increment: currentProgress });
          await timeoutPause(10);
          await item.move(importer);
        }

        if (selectorTransfer.oldSelector && selectorTransfer.newSelector) {
          await findReplaceSelectorsInTemplateFiles(
            construct,
            selectorTransfer.oldSelector,
            selectorTransfer.newSelector,
            output
          );
        } else {
          throw new Error('selectorTransfer not set');
        }

        /* TODO - big steps left...    


        make sure services and directives work - or disable features
        fix selector replacement for Directives [] .[a-z] etc.

        make sure I don't need to leave a compliment to MoveTS

        disable some config item that should lock now

        check what happens with open editors


        look at supporting custom paths within app - indexer issue

        ---- v2 -----

        handle open editors
          looks like reference indexer, replaceReferences() already can - need same for core class file
            close affected open tabs except if unsaved - then warn and stop?

        fix up / remove tsmove conf() configuration

        make sure input newStub matches constraints and formatting allowed by CLI

        refactor for clean classes, functions and pure async await

        ---- v3 -----
        */

        // delete original folder
        fs.remove(originalFileDetails.path);

        progress.report({ increment: 100 });
        const renameTime = Math.round((Date.now() - start) / 10) / 100;
        logInfo(output, ['', `${title} completed in ${renameTime} seconds`]);
        await timeoutPause(50);
      } catch (e) {
        console.log('error in extension.ts', e);
      }
    }
  );
}