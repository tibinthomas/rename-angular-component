import * as vscode from 'vscode';
import { pascalCase } from 'pascal-case';
import {
  AngularConstruct,
  OriginalFileDetails,
} from './definitions/file.interfaces';
import { renameToNewStub } from './renameToNewStub.function';
import { originalFileDetails } from './fileManipulation/originalFileDetails.function';
import { getProjectRoot } from './definitions/getProjectRootFilePath.function';
import { ReferenceIndexer } from '../indexer/referenceindexer';
import { likeFilesRegexPartialLookup } from './definitions/file-regex.constants';
import { FileItem } from '../indexer/fileitem';
import * as fs from 'fs-extra-promise';
import escapeStringRegexp from 'escape-string-regexp';
import { paramCase } from 'change-case';

export async function rename(
  construct: AngularConstruct,
  uri: vscode.Uri,
  importer: ReferenceIndexer,
  indexerInitialisePromise: Thenable<any>
) {
  const start = Date.now();
  const fileDetails = originalFileDetails(uri.path);
  const projectRoot = getProjectRoot(uri) as string;
  const title = `Rename Angular ${pascalCase(construct)}`;

  let newStub = await vscode.window.showInputBox({
    title,
    prompt: `Enter the new ${construct} name.`,
    value: fileDetails.stub,
  });

  if (!newStub || fileDetails.stub === newStub) {
    // TODO: add pop up - nothing changed

    return;
  }
  // make sure it's kebab
  newStub = paramCase(newStub);

  const timeoutPause = async (wait = 0) => {
    await new Promise((res) => setTimeout(res, wait));
    return;
  };

  // wait for indexer initialise to complete
  await indexerInitialisePromise;
  const output = importer.setOutputChannel(
    `Rename Angular ${pascalCase(construct)}`
  );

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: title + ' in progress',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      await timeoutPause();

      // TODO: REMOVE OLD PROCSESS...
      // renameToNewStub(construct, newStub, fileDetails, projectRoot);

      const filesRelatedToStub = await FilesRelatedToStub.init(
        fileDetails,
        projectRoot,
        construct
      );

      const filesToMove = filesRelatedToStub.getFilesToMove(newStub);

      const fileMoveJobs = filesToMove.map((f) => {
        return new FileItem(
          f.filePath,
          f.newFilePath,
          fs.statSync(f.filePath).isDirectory()
        );
      });

      console.log('fileMoveJobs', fileMoveJobs);

      if (fileMoveJobs.some((l) => l.exists())) {
        vscode.window.showErrorMessage(
          'Not allowed to overwrite existing files'
        );
        return;
      }

      progress.report({ increment: 20 });
      await timeoutPause();

      const progressIncrement = Math.floor(80 / fileMoveJobs.length);
      let currentProgress = 20;
      importer.startNewMoves(fileMoveJobs);
      try {
        for (const item of fileMoveJobs) {
          currentProgress += progressIncrement;
          progress.report({ increment: currentProgress });
          await timeoutPause(10);
          await item.move(importer);
        }
      } catch (e) {
        console.log('error in extension.ts', e);
      }

      /* TODO - big steps left...
              delete the old folder

              in the construct file, rename the class, selector, and html and scss/css imports
              if they're .ts, rename the classes too

              fix up all selectors
              fix up all test descriptions

              make sure services and directives work - or disable features

              make sure I don't need to leave a compliment to MoveTS

              check what happens with open editors

              ---- v2 -----

              handle open editors
                looks like reference indexer, replaceReferences() already can - need same for core class file

              fix up / remove tsmove conf() configuration

              make sure input newStub matches constraints and formatting allowed by CLI

              refactor for clean classes, functions and pure async await

              ---- v3 -----
              */

      progress.report({ increment: 100 });
      console.log('all done: ', Date.now() - start + `ms.`);
      await timeoutPause(50);
    }
  );
}

class FilesRelatedToStub {
  originalFileDetails!: OriginalFileDetails;
  folderNameSameAsStub = false;
  fileDetails: {
    filePath: string;
    sameConstruct: boolean;
    sameStub: boolean;
  }[] = [];
  constructFilesRegex!: RegExp;
  relatedFilesRegex!: RegExp;

  static async init(
    fileDetails: OriginalFileDetails,
    projectRoot: string,
    construct: AngularConstruct
  ) {
    const instance = new FilesRelatedToStub();
    await instance.catalogueFilesInCurrentFolder(
      fileDetails,
      projectRoot,
      construct
    );
    return instance;
  }

  private async catalogueFilesInCurrentFolder(
    fileDetails: OriginalFileDetails,
    projectRoot: string,
    construct: AngularConstruct
  ) {
    this.originalFileDetails = fileDetails;

    if (fileDetails.path.endsWith(fileDetails.stub)) {
      this.folderNameSameAsStub = true;
    }

    const glob = `${fileDetails.path.replace(projectRoot + '/', '')}/**/*`;
    const uris = await vscode.workspace.findFiles(
      glob,
      '**/node_modules/**',
      100000
    );

    this.constructFilesRegex = RegExp(
      `${escapeStringRegexp(fileDetails.stub)}${
        likeFilesRegexPartialLookup[construct]
      }`
    );
    this.relatedFilesRegex = new RegExp(
      `${escapeStringRegexp(fileDetails.stub)}${
        likeFilesRegexPartialLookup.any
      }`
    );

    uris.forEach((uri) => {
      this.fileDetails.push({
        filePath: uri.fsPath,
        sameConstruct: !!uri.fsPath.match(this.constructFilesRegex),
        sameStub: !!uri.fsPath.match(this.relatedFilesRegex),
      });
    });
  }

  getFilesToMove(newStub: string) {
    const folderReplaceRegex = new RegExp(
      `(?<=\/)${escapeStringRegexp(this.originalFileDetails.stub)}$`
    );
    const replaceStub = (filePath: string) => {
      if (this.folderNameSameAsStub) {
        filePath = filePath.replace(
          this.originalFileDetails.path,
          this.originalFileDetails.path.replace(folderReplaceRegex, newStub)
        );
      }
      return filePath.replace(this.constructFilesRegex, newStub);
    };

    return this.fileDetails
      .filter((fd) => this.folderNameSameAsStub || fd.sameConstruct)
      .map((fd) => ({
        filePath: fd.filePath,
        newFilePath: replaceStub(fd.filePath),
      }));
  }
}
