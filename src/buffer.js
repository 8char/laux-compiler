const SPACES_RE = /^[ \t]+$/;

export default class Buffer {
  _buffer = [];
  _queue = [];
  _last = "";

  _position = {
    line: 1,
    column: 0,
  };
  _sourcePosition = {
    identifierName: null,
    line: null,
    column: null,
    filename: null,
  };

  constructor() {

  }

  get() {
    this._flush();

    const result = {
      code: this._buffer.join("")
    };

    return result;
  }

  queue(str) {
    if (str == "\n")
      while (this._queue.length > 0 && SPACES_RE.test(this._queue[0][0]))
        this._queue.shift();

    const { line, column, fileName, identifierName } = this._sourcePosition;
    this._queue.unshift([str, line, column, identifierName, fileName]);
  }

  append(str) {
    this._flush();
    const { line, column, fileName, identifierName } = this._sourcePosition;
    this._append(str, line, column, identifierName, fileName);
  }

  removeTrailingNewline() {
    if (this._queue.length > 0 && this._queue[0][0] === "\n")
      this._queue.shift();
  }

  removeLastSemicolon() {
    if (this._queue.length > 0 && this._queue[0][0] === ";")
      this._queue.shift();
  }

  hasContent() {
    return this._buffer.length > 0 || !!this._last;
  }

  endsWith(suffix) {
    if (suffix.length == 1) {
      let last;
      if (this._queue.length > 0) {
        const str = this._queue[0][0];
        last = str[str.length - 1];
      }
      else {
        last = this._last;
      }

      return last === suffix;
    }

    const end = this._last + this._queue.reduce((acc, item) => item[0] + acc, "");
    if (suffix.length <= end.length) {
      return end.slice(-suffix.length) === suffix;
    }

    return false;
  }

  getCurrentLine() {
    const extra = this._queue.reduce((acc, item) => item[0] + acc, "");

    let count = 0;
    for (let i = 0; i < extra.length; i++) {
      if (extra[i] === "\n") count++;
    }

    return this._position.line + count;
  }

  getCurrentColumn() {
    const extra = this._queue.reduce((acc, item) => item[0] + acc, "");
    const lastIndex = extra.lastIndexOf("\n");

    return lastIndex === -1 ? this._position.column + extra.length : (extra.length - 1 - lastIndex);
  }

  _flush() {
    let item;
    while (item = this._queue.pop())
      this._append(...item);
  }

  _append(str, line, column, identifierName, fileName) {
    this._buffer.push(str);
    this._last = str[str.length - 1];

    for (let i = 0; i < str.length; i++) {
      if (str[i] == "\n") {
        this._position.line++;
        this._position.column = 0;
      }
      else {
        this._position.column++;
      }
    }
  }
}