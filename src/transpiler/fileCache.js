import path from "path";

export default class CacheFile {
  constructor(relativePath) {
    this.parse = path.parse(relativePath);
  }

  getCleanPath() {
    return path.join(this.parse.dir, this.parse.name).replace(/\\/g, "/");
  }

  getPath() {
    return path.join(this.parse.dir, this.parse.base).replace(/\\/g, "/");
  }

  setContent(content) {
    this.content = content;
  }

  getContent() {
    return this.content;
  }

  setCompiledFile(compiledFile) {
    this.compiledFile = compiledFile;
  }

  getCompiledFile() {
    return this.compiledFile;
  }
}
