import chalk from "chalk";
import tokenizer from "./tokenizer";

function isFunction(obj) {
  return toString.call(obj) === "[object Function]";
}

var code, splits, lastSplitEnd;

function addSplit(start, end, color) {
  var result, nextIndex, skip = 0;

  if (start >= end) return;

  if (color) {
    splits.push(color(code.slice(start, end)));
  }
  else {
    splits.push(code.slice(start, end));
  }

  lastSplitEnd = end;

  return skip;
}

var highlighter = {
  colors: {
    Keyword: {
      local: chalk.cyan,
      while: chalk.cyan,
      do: chalk.cyan,
      for: chalk.cyan,
      of: chalk.cyan,
      in: chalk.cyan,

      if: chalk.cyan,
      else: chalk.cyan,
      elseif: chalk.cyan,
      then: chalk.cyan,

      function: chalk.cyan,
      end: chalk.cyan,

      class: chalk.cyan,
      extends: chalk.cyan,
      static: chalk.cyan,

      self: chalk.cyan,

      super: chalk.yellow,
    },
    Punctuator: {
      "->": chalk.cyan,
      "=>": chalk.cyan,

      "!": chalk.cyan,
      "||": chalk.cyan,
      "&&": chalk.cyan,
      "!=": chalk.cyan,
      "~=": chalk.cyan,
      "==": chalk.cyan,

      "++": chalk.cyan,
      "-=": chalk.cyan,
      "+=": chalk.cyan,
      "*=": chalk.cyan,
      "/=": chalk.cyan,
      "%=": chalk.cyan,
      "..=": chalk.cyan,
    },
    Identifier: {
      constructor: chalk.yellow,
    },
    BooleanLiteral: {
      _default: chalk.magenta
    },
    NumericLiteral: {
      _default: chalk.green
    },
    StringLiteral: {
      _default: chalk.yellow
    }
  },

  highlight: function(_code, options) {
    splits = [];
    lastSplitEnd = 0;
    code = _code;

    var colors = this.colors;
    if (options) {
      if (options.colors) {
        colors = options.colors;
      }
    }

    var tokens = tokenizer.tokenize(code, {
      skipExceptions: true
    });

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      var start, end;
      start = token.range[0];
      end = token.range[1];

      var colorForType = colors[token.type];

      var color = colorForType &&
        colorForType.hasOwnProperty(token.value) &&
        colorForType[token.value] &&
        isFunction(colorForType[token.value]) ?
          colorForType[token.value] :
          colorForType && colorForType._default;

      addSplit(lastSplitEnd, start);
      var skip = addSplit(start, end, color)
    }


    return splits.join("");
  }
}

export default highlighter;