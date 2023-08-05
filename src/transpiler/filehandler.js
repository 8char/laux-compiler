import path from "path";
import chokidar from "chokidar";
import chalk from "chalk";
import jetpack from "fs-jetpack";
import glob from "fast-glob";
import highlighter from "../highlighter";
import CodeGenerator from "../codegenerator";
import CacheFile from "./fileCache";
import Compile from "./compile";

export default class FileHandler {
  // Disable transpiling at the start
  canTranspile = false;

  static create(workspace) {
    return new FileHandler(workspace);
  }

  constructor(workspace) {
    this.fileMap = new Map();
    this.mergeMap = new Map();
    this.transpileMap = new Map();
    this.release = workspace.isRelease();
    this.workspace = workspace;

    const { error } = this.scanMerges();
    if (error === undefined) {
      this.watchFiles();
    } else {
      console.log(`Error: ${error.stack}`);
      // TODO: Give me better error message
    }
  }

  scanMerges() {
    if (!this.release) return {};

    const merges = this.workspace.getMerges();
    merges.forEach((entry) => {
      const { output } = entry;
      let files = [];
      if (entry.filesGlob) {
        entry.filesGlob.forEach((fileGlob) => {
          files = files.concat(
            files,
            glob.sync(fileGlob, {
              dot: true,
              cwd: this.workspace.getAbsoluteInput(),
            }),
          );
        });
        files.sort();
      }
      if (entry.files) {
        files = files.concat(files, entry.files);
      }
      files.forEach((file) => {
        const fileName = new CacheFile(file);
        // If we already have it in merge map we need to stop & return an error.
        // No duplicates!
        if (this.mergeMap.has(fileName.getCleanPath())) {
          return {
            error: new Error(
              `Attempting to merge files, but ${fileName.getCleanPath()} is a duplicate`,
            ),
          };
        }

        this.mergeMap.set(fileName.getCleanPath(), output);

        return undefined;
      });
    });

    return { success: true };
  }

  async loadFile(file) {
    if (file === undefined) return;

    const relativePath = path.join(
      this.workspace.getAbsoluteInput(),
      file.getPath(),
    );
    const content = await jetpack.readAsync(relativePath);

    file.setContent(content);
    this.fileMap.set(file.getCleanPath(), file);
  }

  async transpileAll() {
    if (this.canTranspile === false) return;

    const transpiled = [];

    this.fileMap.forEach((file, outputName) => {
      transpiled.push({
        file: this.loadFile(file),
        output: outputName,
      });
    });

    await Promise.all(transpiled.map((transpile) => transpile.file));

    const outputFiles = {};
    const usedFiles = {};
    this.mergeMap.forEach((output, input) => {
      if (!Object.prototype.hasOwnProperty.call(outputFiles, output)) {
        outputFiles[output] = [input];
      } else {
        outputFiles[output].push(input);
      }

      usedFiles[input] = true;
    });
    this.fileMap.forEach((file, name) => {
      if (!usedFiles[name]) {
        outputFiles[name] = [file.getCleanPath()];
      }
    });

    const filesString = {};

    Object.entries(outputFiles).forEach(([output, files]) => {
      const str = files
        .map((filePath) => {
          const file = this.fileMap.get(filePath);
          if (file !== undefined) {
            return file.getContent();
          }
          console.log(
            `${chalk.magenta("LAUX")} ${chalk.yellow(
              "WARNING",
            )} Unable to find ${filePath} file!`,
          );
          return "";
        })
        .join("\r\n");

      filesString[output] = str;
    });

    this.transpileFiles(filesString);
  }

  transpileFiles(filesString, change = false) {
    Object.entries(filesString).forEach(([fileName, content]) => {
      try {
        const fileObj = this.fileMap.get(fileName);
        if (fileObj !== undefined && fileObj.parse.ext === ".lua") {
          this.copyFile(fileName);

          console.log(
            `${chalk.magenta("LAUX")} ${chalk.gray("COPIED")} ${fileName}.lua`,
          );

          return; // Use 'return' instead of 'continue'
        }

        let elapsed = 0;
        const timeStart = process.hrtime();
        const compiledFile = Compile.compileCode(content, this.workspace);
        this.transpileMap.set(fileName, compiledFile);
        this.writeFile(fileName);
        elapsed = process.hrtime(timeStart)[1] / 100000;

        const roundedElapsed = Math.round(elapsed * 1000.0) / 1000.0;
        const amount =
          content.split("------------ Split Break -------------").length - 1;
        let aggregate = "";
        if (amount > 1) {
          aggregate = `[${amount} files -> 1] `;
        }
        console.log(
          `${chalk.magenta("LAUX")} ${
            change ? chalk.cyan("CHANGE") : chalk.magenta("BUILT")
          } ${fileName}.lua ${chalk.cyan(aggregate)}${chalk.green(
            `${roundedElapsed}ms`,
          )}`,
        );
      } catch (e) {
        if (e instanceof SyntaxError) {
          const lines = content.split(/\r?\n/);

          const lineStart = Math.max(0, e.line - 3);
          const lineEnd = Math.min(lines.length, e.line + 3);

          console.log(
            `${chalk.magenta("LAUX")} ${chalk.red(
              "ERROR",
            )} SyntaxError: ${fileName}: ${e.message}`,
          );

          for (let i = lineStart; i < lineEnd; i += 1) {
            const line = lines[i];

            const c1 = i + 1 === e.line ? ">" : " ";
            const lineFillStr = new Array(
              lineEnd.toString().length - (i + 1).toString().length + 1,
            ).join(" ");
            const lineStr = lineFillStr + (i + 1).toString();
            const litLine = highlighter.highlight(line);
            console.log(chalk.red(c1) + chalk.gray(` ${lineStr} | `) + litLine);

            if (i + 1 === e.line) {
              const offset = new Array(e.column + 1).join(" ");
              console.log(
                ` ${chalk.gray(
                  `${new Array(lineStr.length + 2).join(" ")} | `,
                )}${chalk.red(`${offset}^`)}`,
              );
            }
          }

          console.log(e.stack);
        } else {
          console.log(
            `${chalk.magenta("LAUX")} ${chalk.red("ERROR")} ${fileName}.laux:`,
          );
          console.log(
            `${chalk.magenta("LAUX")} ${chalk.red("ERROR")} ${e.stack}`,
          );
        }
      }
    });
  }

  async copyFile(fileName) {
    try {
      const sourcePath = path.join(
        this.workspace.getAbsoluteOutput(),
        "..",
        this.workspace.getInput(),
      );
      jetpack.copyAsync(
        path.join(sourcePath, `${fileName}.lua`),
        path.join(this.workspace.getAbsoluteOutput(), `${fileName}.lua`),
        { overwrite: true },
      );
    } catch (e) {
      console.error(`Error: ${e.stack}`);
    }
  }

  async removeFile(fileObj) {
    try {
      jetpack.removeAsync(
        path.join(this.workspace.getAbsoluteOutput(), fileObj.getPath()),
      );

      console.log(
        `${chalk.magenta("LAUX")} ${chalk.red("REMOVED")} ${fileObj.getPath()}`,
      );
    } catch (e) {
      console.error(`Error: ${e.stack}`);
    }
  }

  async writeFile(fileName) {
    const compiledFile = this.transpileMap.get(fileName);
    const result = new CodeGenerator(
      compiledFile.code,
      compiledFile.compiledAST,
    ).generate();

    try {
      const compiledPathNoExt = path.join(
        this.workspace.getAbsoluteOutput(),
        fileName,
      );
      if (this.workspace.getAST()) {
        jetpack.writeAsync(
          `${compiledPathNoExt}.ast.json`,
          JSON.stringify(compiledFile.ast, null, 2),
        );
        jetpack.writeAsync(
          `${compiledPathNoExt}.ast_compiled.json`,
          JSON.stringify(compiledFile.compiledAST, null, 2),
        );
      }

      jetpack.writeAsync(`${compiledPathNoExt}.lua`, result.code);
    } catch (e) {
      console.error(`Error: ${e.stack}`);
    }
  }

  async transpileFile(fileObj) {
    if (this.canTranspile === false) return;

    const outputFiles = {};
    const usedFiles = {};
    this.mergeMap.forEach((output, input) => {
      if (!Object.prototype.hasOwnProperty.call(outputFiles, output)) {
        outputFiles[output] = [input];
      } else {
        outputFiles[output].push(input);
      }

      usedFiles[input] = true;
    });
    this.fileMap.forEach((file, name) => {
      if (!usedFiles[name]) {
        outputFiles[name] = [file.getCleanPath()];
      }
    });

    const transpiled = [];
    Object.entries(outputFiles).forEach(([name, files]) => {
      if (files.includes(fileObj.getCleanPath())) {
        files.forEach((filePath) => {
          const file = this.fileMap.get(filePath);
          transpiled.push({
            file: this.loadFile(file),
            output: name,
          });
        });
      }
    });
    await Promise.all(transpiled.map((transpile) => transpile.file));

    let str = "";
    let chosenName = "";
    const cleanPath = fileObj.getCleanPath();

    Object.entries(outputFiles).forEach(([name, files]) => {
      if (files.includes(cleanPath)) {
        chosenName = name;
        files.forEach((filePath) => {
          const file = this.fileMap.get(filePath);
          if (file !== undefined) {
            str += `${file.getContent()}\r\n`;
          } else {
            console.log(
              `${chalk.magenta("LAUX")} ${chalk.yellow(
                "WARNING",
              )} Unable to find ${filePath} file!`,
            );
          }
        });

        // Exit the loop after processing the first match
        return false;
      }

      return undefined;
    });

    const filesString = {};
    filesString[chosenName] = str;

    this.transpileFiles(filesString, true);
  }

  watchFiles() {
    const absolutePath = this.workspace.getAbsoluteInput();
    const watcher = chokidar.watch(path.join(absolutePath, "**/*.{lua,laux}"));

    watcher.on("add", async (filePath) => {
      const relativePath = path.relative(absolutePath, filePath);
      const fileObj = new CacheFile(relativePath);
      this.fileMap.set(fileObj.getCleanPath(), fileObj);

      console.log(
        `${chalk.magenta("LAUX")} ${chalk.green("ADD")} ${chalk.yellow(
          relativePath,
        )}`,
      );
      await this.transpileFile(fileObj);
    });
    watcher.on("change", async (filePath) => {
      const relativePath = path.relative(absolutePath, filePath);
      const fileObj = new CacheFile(relativePath);
      this.fileMap.set(fileObj.getCleanPath(), fileObj);

      await this.transpileFile(fileObj);
    });
    watcher.on("unlink", async (filePath) => {
      const relativePath = path.relative(absolutePath, filePath);
      const fileObj = new CacheFile(relativePath);

      await this.removeFile(fileObj);

      this.fileMap.delete(fileObj.getCleanPath());
      this.transpileMap.delete(fileObj.getCleanPath());
    });

    // Give it a second to add everything
    setTimeout(async () => {
      this.canTranspile = true;
      this.transpileAll();
    }, 1000);
  }
}
