const SPACES_RE = /^[ \t]+$/;

export default class Buffer {
  internalBuffer = [];

  internalQueue = [];

  internalLast = "";

  internalPosition = {
    line: 1,
    column: 0,
  };

  internalSourcePosition = {
    identifierName: null,
    line: null,
    column: null,
    filename: null,
  };

  get() {
    this.flush();

    const result = {
      code: this.internalBuffer.join(""),
    };

    return result;
  }

  queue(str) {
    if (str === "\n")
      while (
        this.internalQueue.length > 0 &&
        SPACES_RE.test(this.internalQueue[0][0])
      )
        this.internalQueue.shift();

    const { line, column, fileName, identifierName } =
      this.internalSourcePosition;
    this.internalQueue.unshift([str, line, column, identifierName, fileName]);
  }

  append(str) {
    this.flush();
    const { line, column, fileName, identifierName } =
      this.internalSourcePosition;
    this.internalAppend(str, line, column, identifierName, fileName);
  }

  removeTrailingNewline() {
    if (this.internalQueue.length > 0 && this.internalQueue[0][0] === "\n")
      this.internalQueue.shift();
  }

  removeLastSemicolon() {
    if (this.internalQueue.length > 0 && this.internalQueue[0][0] === ";")
      this.internalQueue.shift();
  }

  hasContent() {
    return this.internalBuffer.length > 0 || !!this.internalLast;
  }

  endsWith(suffix) {
    if (suffix.length === 1) {
      let last;
      if (this.internalQueue.length > 0) {
        const str = this.internalQueue[0][0];
        last = str[str.length - 1];
      } else {
        last = this.internalLast;
      }

      return last === suffix;
    }

    const end =
      this.internalLast +
      this.internalQueue.reduce((acc, item) => item[0] + acc, "");

    if (suffix.length <= end.length) {
      return end.slice(-suffix.length) === suffix;
    }

    return false;
  }

  getCurrentLine() {
    const extra = this.internalQueue.reduce((acc, item) => item[0] + acc, "");

    let count = 0;
    for (let i = 0; i < extra.length; i += 1) {
      if (extra[i] === "\n") count += 1;
    }

    return this.internalPosition.line + count;
  }

  getCurrentColumn() {
    const extra = this.internalQueue.reduce((acc, item) => item[0] + acc, "");
    const lastIndex = extra.lastIndexOf("\n");

    return lastIndex === -1
      ? this.internalPosition.column + extra.length
      : extra.length - 1 - lastIndex;
  }

  flush() {
    let item;
    while ((item = this.internalQueue.pop())) this.internalAppend(...item);
  }

  internalAppend(str) {
    this.internalBuffer.push(str);
    this.internalLast = str[str.length - 1];

    for (let i = 0; i < str.length; i += 1) {
      if (str[i] === "\n") {
        this.internalPosition.line += 1;
        this.internalPosition.column = 0;
      } else {
        this.internalPosition.column += 1;
      }
    }
  }
}
