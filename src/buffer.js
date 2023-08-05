const SPACES_RE = /^[ \t]+$/;

export default class Buffer {
  buffer = [];

  queueList = [];

  last = "";

  position = {
    line: 1,
    column: 0,
  };

  sourcePosition = {
    identifierName: null,
    line: null,
    column: null,
    filename: null,
  };

  get() {
    this.flush();

    const result = {
      code: this.buffer.join(""),
    };

    return result;
  }

  queue(str) {
    if (str === "\n")
      while (this.queueList.length > 0 && SPACES_RE.test(this.queueList[0][0]))
        this.queueList.shift();

    const { line, column, fileName, identifierName } = this.sourcePosition;
    this.queueList.unshift([str, line, column, identifierName, fileName]);
  }

  append(str) {
    this.flush();
    const { line, column, fileName, identifierName } = this.sourcePosition;
    this.append(str, line, column, identifierName, fileName);
  }

  removeTrailingNewline() {
    if (this.queueList.length > 0 && this.queueList[0][0] === "\n")
      this.queueList.shift();
  }

  removeLastSemicolon() {
    if (this.queueList.length > 0 && this.queueList[0][0] === ";")
      this.queueList.shift();
  }

  hasContent() {
    return this.buffer.length > 0 || !!this.last;
  }

  endsWith(suffix) {
    if (suffix.length === 1) {
      let last;
      if (this.queueList.length > 0) {
        const str = this.queueList[0][0];
        last = str[str.length - 1];
      } else {
        last = this.last;
      }

      return last === suffix;
    }

    const end =
      this.last + this.queueList.reduce((acc, item) => item[0] + acc, "");
    if (suffix.length <= end.length) {
      return end.slice(-suffix.length) === suffix;
    }

    return false;
  }

  getCurrentLine() {
    const extra = this.queueList.reduce((acc, item) => item[0] + acc, "");

    let count = 0;
    for (let i = 0; i < extra.length; i += 1) {
      if (extra[i] === "\n") count += 1;
    }

    return this.position.line + count;
  }

  getCurrentColumn() {
    const extra = this.queueList.reduce((acc, item) => item[0] + acc, "");
    const lastIndex = extra.lastIndexOf("\n");

    return lastIndex === -1
      ? this.position.column + extra.length
      : extra.length - 1 - lastIndex;
  }

  flush() {
    let item;
    do {
      item = this.queueList.pop();
      if (!item) {
        this.internalAppend(...item);
      }
    } while (item);
  }

  internalAppend(str) {
    this.buffer.push(str);
    this.last = str[str.length - 1];

    for (let i = 0; i < str.length; i += 1) {
      if (str[i] === "\n") {
        this.position.line += 1;
        this.position.column = 0;
      } else {
        this.position.column += 1;
      }
    }
  }
}
