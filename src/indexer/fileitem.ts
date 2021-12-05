import * as Promise from 'bluebird';
import * as fs from 'fs-extra-promise';
import * as path from 'path';

import { ReferenceIndexer } from './referenceindexer';
import { GenericEdit } from './ts-file-helpers';

export class FileItem {
  constructor(
    public sourcePath: string,
    public targetPath: string,
    public isDir: boolean,
    public originalClassName?: string,
    public newClassName?: string,
    public additionalEdits?: (filePath: string, text: string) => GenericEdit[]
  ) {}

  exists(): boolean {
    return fs.existsSync(this.targetPath);
  }

  public move(index: ReferenceIndexer): Promise<FileItem> {
    return this.ensureDir()
      .then(() => {
        if (this.isDir) {
          return index
            .updateDirImports(this.sourcePath, this.targetPath)
            .then(() => {
              return fs.renameAsync(this.sourcePath, this.targetPath);
            })
            .then(() => {
              return index.updateMovedDir(this.sourcePath, this.targetPath);
            })
            .then(() => {
              return this;
            });
        } else {
          return index
            .updateImports(this.sourcePath, this.targetPath)
            .then(() => {
              return fs.renameAsync(this.sourcePath, this.targetPath);
            })
            .then(() => {
              return index.updateMovedFile(
                this.sourcePath,
                this.targetPath
                // this.additionalEdits
              );
            })
            .then(() => {
              return this;
            });
        }
      })
      .then((): any => {
        return this;
      })
      .catch((e) => {
        console.log('error in move', e);
      });
  }

  private ensureDir(): Promise<any> {
    return fs.ensureDirAsync(path.dirname(this.targetPath));
  }
}
