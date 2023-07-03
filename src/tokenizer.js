let input; let options; let
  length;

// Options can be set either globally on the parser object through
// defaultOptions, or during the parse call.
const defaultOptions = exports.defaultOptions = {
  // Skip over unexpected tokens instead of throwing an exception.
  skipExceptions: false,
  // Store comments as an array in the chunk object.
  comments: true,
};

const errors = {
  unexpected: "unexpected %1 '%2' near '%3'",
  expected: "'%1' expected near '%2'",
  expectedToken: "%1 expected near '%2'",
  unfinishedString: "unfinished string near '%1'",
  malformedNumber: "malformed number near '%1'",
  invalidVar: "invalid left-hand side of assignment near '%1'",
};

const { slice } = Array.prototype;

// A sprintf implementation using %index (beginning at 1) to input
// arguments in the format string.
//
// Example:
//
//     // Unexpected function in token
//     sprintf("Unexpected %2 in %1.", "token", "function");

function sprintf(format) {
  const args = slice.call(arguments, 1);
  format = format.replace(/%(\d)/g, (match, index) => `${args[index - 1]}` || '');
  return format;
}

function extend() {
  const args = slice.call(arguments);
  const dest = {};
  let src; let
    prop;

  for (let i = 0, { length } = args; i < length; i++) {
    src = args[i];
    for (prop in src) {
      if (src.hasOwnProperty(prop)) {
        dest[prop] = src[prop];
      }
    }
  }
  return dest;
}

// ### Error functions

// #### Raise an exception.
//
// Raise an exception by passing a token, a string format and its paramters.
//
// The passed tokens location will automatically be added to the error
// message if it exists, if not it will default to the lexers current
// position.
//
// Example:
//
//     // [1:0] expected [ near (
//     raise(token, "expected %1 near %2", "[", token.value);

function raise(token) {
  const message = sprintf.apply(null, slice.call(arguments, 1));
  let error; let
    col;

  if (typeof token.loc !== 'undefined') {
    const { start } = token.loc;

    error = new SyntaxError(sprintf('a[%1:%2] %3', start.line, start.column, message));
    error.index = token.range[0];
    error.line = start.line;
    error.column = start.column;
  } else {
    col = index - lineIndex - 1;

    error = new SyntaxError(sprintf('a[%1:%2] %3', line, col, message));
    error.index = index;
    error.line = line;
    error.column = col;
  }
  throw error;
}

// #### Raise an unexpected token error.
//
// Example:
//
//     // expected <name> near '0'
//     raiseUnexpectedToken("<name>", token);

function raiseUnexpectedToken(type, token) {
  raise(token, errors.expectedToken, type, token.value);
}

// #### Raise a general unexpected error
//
// Usage should pass either a token object or a symbol string which was
// expected. We can also specify a nearby token such as <eof>, this will
// default to the currently active token.
//
// Example:
//
//     // Unexpected symbol 'end' near '<eof>'
//     unexpected(token);
//
// If there's no token in the buffer it means we have reached <eof>.

function unexpected(found, near) {
  if (typeof near === 'undefined') near = lookahead.value;
  if (typeof found.type !== 'undefined') {
    let type;
    switch (found.type) {
      case StringLiteral: type = 'string'; break;
      case Keyword: type = 'keyword'; break;
      case Identifier: type = 'identifier'; break;
      case NumericLiteral: type = 'number'; break;
      case Punctuator: type = 'symbol'; break;
      case BooleanLiteral: type = 'boolean'; break;
      case NilLiteral:
        return raise(found, errors.unexpected, 'symbol', 'nil', near);
    }
    return raise(found, errors.unexpected, type, found.value, near);
  }
  return raise(found, errors.unexpected, 'symbol', found, near);
}

// Token
class Token {
  constructor(type, value, start, end, loc) {
    this.type = type;
    this.value = value;
    this.range = [start, end];
    this.loc = loc;
  }
}

// Source Location
class SourceLocation {
  constructor(lineStart, columnStart, lineEnd, columnEnd) {
    this.start = {
      line: lineStart,
      column: columnStart,
    };
    this.end = {
      line: lineEnd,
      column: columnEnd,
    };
  }
}

let index;
let token;
let previousToken;
let lookahead;
let tokenStart;
let line;
let lineIndex;
let lineStart;
let lineStartIndex;

// Lexer
// -----
//
// The lexer, or the tokenizer reads the input string character by character
// and derives a token left-right. To be as efficient as possible the lexer
// prioritizes the common cases such as identifiers. It also works with
// character codes instead of characters as string comparisons was the
// biggest bottleneck of the parser.
//
// If `options.comments` is enabled, all comments encountered will be stored
// in an array which later will be appended to the chunk object. If disabled,
// they will simply be disregarded.
//
// When the lexer has derived a valid token, it will be returned as an object
// containing its value and as well as its position in the input string (this
// is always enabled to provide proper debug messages).
//
// `lex()` starts lexing and returns the following token in the stream.
/**
  The lexer, or the tokenizer reads the input string character by character and derives a token left-right.
  To be as efficient as possible the lexer prioritizes the common cases such as identifiers.
  It also works with character codes instead of characters as string comparisons was the biggest bottleneck of the parser.
  If options.comments is enabled, all comments encountered will be stored in an array which later will be appended to the chunk object.
  If disabled, they will simply be disregarded.
  @returns {Object} An object containing the value and its position in the input string.
*/
function lex() {
  skipWhiteSpace();

  // Skip comments beginning with --
  while ((input.charCodeAt(index) === 45
        && input.charCodeAt(index + 1) === 45)) {
    /*
    let comment = scanComment();
    if (comment)
          return comment
          */
    scanComment();
    skipWhiteSpace();
  }

  const charCode = input.charCodeAt(index);
  const next = input.charCodeAt(index + 1);

  // Memorize the range index where the token begins.
  tokenStart = index;
  lineStart = line;
  lineStartIndex = lineIndex;

  if (index >= length) return scanEOF();
  if (isIdentifierStart(charCode)) return scanIdentifierOrKeyword();

  switch (charCode) {
    case 39: case 34: // '"
      return scanStringLiteral();

    case 96: // `
      return scanStringLiteral(true);

      // 0-9
    case 48: case 49: case 50: case 51: case 52: case 53:
    case 54: case 55: case 56: case 57:
      return scanNumericLiteral();

    case 46: // .
    // If the dot is followed by a digit it's a float.
      if (isDecDigit(next)) return scanNumericLiteral();
      if (next === 46) {
        if (input.charCodeAt(index + 2) === 46) return scanVarargLiteral();
        if (input.charCodeAt(index + 2) === 61) return scanPunctuator('..=');
        return scanPunctuator('..');
      }
      return scanPunctuator('.');

    case 63: // ?
      if (next === 46) return scanPunctuator('?.');
      if (next === 91) return scanPunctuator('?[');
      if (next === 58) return scanPunctuator('?:');
      if (next === 63) {
        if (input.charCodeAt(index + 2) === 61) return scanPunctuator('??=');
        return scanPunctuator('??');
      }

    case 61: // =
      if (next === 61) return scanPunctuator('==');
      if (next === 62) return scanPunctuator('=>');
      return scanPunctuator('=');

    case 62: // >
      if (next === 61) return scanPunctuator('>=');
      if (next === 62) return scanPunctuator('>>');
      return scanPunctuator('>');

    case 60: // <
      if (next === 60) return scanPunctuator('<<');
      if (next === 61) return scanPunctuator('<=');
      return scanPunctuator('<');

    case 126: // ~
      if (next === 61) return scanPunctuator('~=');
      return scanPunctuator('~');

    case 58: // :
      if (next === 58) return scanPunctuator('::');
      return scanPunctuator(':');

    case 91: // [
    // Check for a multiline string, they begin with [= or [[
      if (next === 91 || next === 61) return scanLongStringLiteral();
      return scanPunctuator('[');

    case 47: // /
    // Check for integer division op (//)
      if (next === 47) return scanPunctuator('//');
      if (next === 61) return scanPunctuator('/=');
      return scanPunctuator('/');

    case 38: // &&
      if (next === 38) return scanPunctuator('&&');
      return scanPunctuator('&');

    case 124: // ||
      if (next === 124) {
        if (input.charCodeAt(index + 2) === 61) return scanPunctuator('||=');

        return scanPunctuator('||');
      }

      return scanPunctuator('|');

    case 33: // !
      if (next === 61) return scanPunctuator('!=');
      return scanPunctuator('!');

    case 43: // +
      if (next === 43) return scanPunctuator('++');
      if (next === 61) return scanPunctuator('+=');
      return scanPunctuator('+');

    case 45: // -
      if (next === 61) return scanPunctuator('-=');
      if (next === 62) return scanPunctuator('->');
      return scanPunctuator('-');

    case 42: // *
      if (next === 61) return scanPunctuator('*=');
      return scanPunctuator('*');

    case 37:
      if (next === 61) return scanPunctuator('%=');
      return scanPunctuator('%');

      // ^ , { } ] ( ) ; & # |
    case 94: case 44: case 123: case 124: case 125:
    case 93: case 40: case 41: case 59: case 38: case 35:
      return scanPunctuator(input.charAt(index));
  }

  if (options.skipExceptions) {
    index++;
    return lex();
  }

  return unexpected(input.charAt(index));
}

// ## Lex functions and helpers.

// Read the next token.
//
// This is actually done by setting the current token to the lookahead and
// reading in the new lookahead token.

/**
  Sets the current token to the lookahead and reads in the new lookahead token.
  @function
  @returns {void}
*/

function next() {
  previousToken = token;
  token = lookahead;
  lookahead = lex();
}

// Whitespace has no semantic meaning in lua so simply skip ahead while
// tracking the encounted newlines. Any kind of eol sequence is counted as a
// single line.

/**
  Skips ahead while tracking the encountered newlines, as whitespace has no semantic meaning in lua.
  @function
  @returns {boolean} - true if an end of line sequence is encountered, false otherwise
*/

function consumeEOL() {
  const charCode = input.charCodeAt(index);
  const peekCharCode = input.charCodeAt(index + 1);

  if (isLineTerminator(charCode)) {
    // Count \n\r and \r\n as one newline.
    if (charCode === 10 && peekCharCode === 13) index++;
    if (charCode === 13 && peekCharCode === 10) index++;

    line++;
    lineIndex = ++index;

    return true;
  }
  return false;
}

/**
  Scans for the end of file token and returns a new Token object with the appropriate information.
  @function
  @returns {Token} - the new Token object for the end of file
*/

function scanEOF() {
  return new Token(
    'EOF',
    '<eof>',
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );
}

// Identifiers, keywords, booleans and nil all look the same syntax wise. We
// simply go through them one by one and defaulting to an identifier if no
// previous case matched.

/**
  Scan an identifier or keyword token from the input string.
  @returns {Token} The resulting token.
*/

function scanIdentifierOrKeyword() {
  let value; let
    type;

  // Slicing the input string is prefered before string concatenation in a
  // loop for performance reasons.
  while (isIdentifierPart(input.charCodeAt(++index)));
  value = input.slice(tokenStart, index);

  // Decide on the token type and possibly cast the value.
  if (isKeyword(value)) {
    type = 'Keyword';
  } else if (value === 'true' || value === 'false') {
    type = 'BooleanLiteral';
    value = (value === 'true');
  } else if (value === 'nil') {
    type = 'NilLiteral';
    value = null;
  } else {
    type = 'Identifier';
  }

  return new Token(
    type,
    value,
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );
}

// Once a punctuator reaches this function it should already have been
// validated so we simply return it as a token.

/**
  Scan a punctuator token from the input string.
  @param {string} value - The value of the punctuator.
  @returns {Token} The resulting token.
*/

function scanPunctuator(value) {
  index += value.length;

  return new Token(
    'Punctuator',
    value,
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );
}

// A vararg literal consists of three dots.

/**
  Scan a vararg literal token from the input string.
  @returns {Token} The resulting token.
*/

function scanVarargLiteral() {
  index += 3;
  return new Token(
    'VarargLiteral',
    '...',
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );
}

// Find the string literal by matching the delimiter marks used.

/**
  Scan a string literal token from the input string.
  @param {boolean} isTemplate - Whether or not the string is a template.
  @returns {Token} The resulting token.
*/

function scanStringLiteral(isTemplate) {
  const delimiter = input.charCodeAt(index++);
  let stringStart = index;
  let string = '';
  let charCode;

  while (index < length) {
    charCode = input.charCodeAt(index++);
    if (delimiter === charCode) break;
    if (charCode === 92) { // \
      string += input.slice(stringStart, index - 1) + readEscapeSequence();
      stringStart = index;
    }
    // EOF or `\n` terminates a string literal. If we haven't found the
    // ending delimiter by now, raise an exception.
    else if ((index >= length || isLineTerminator(charCode)) && !options.skipExceptions) {
      string += input.slice(stringStart, index - 1);
      raise({}, errors.unfinishedString, string + String.fromCharCode(charCode));
    }
  }
  string += input.slice(stringStart, index - 1);

  const token = new Token(
    'StringLiteral',
    string,
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );

  token.isTemplate = isTemplate;
  return token;
}

// Expect a multiline string literal and return it as a regular string
// literal, if it doesn't validate into a valid multiline string, throw an
// exception.

/**
  Scan a long string literal token from the input string.
  @returns {Token} The resulting token.
*/

function scanLongStringLiteral() {
  const string = readLongString();
  // Fail if it's not a multiline literal.
  if (string === false && !options.skipExceptions) raise(token, errors.expected, '[', token.value);

  return new Token(
    'StringLiteral',
    string,
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );
}

// Numeric literals will be returned as floating-point numbers instead of
// strings. The raw value should be retrieved from slicing the input string
// later on in the process.
//
// If a hexadecimal number is encountered, it will be converted.

/**
  Scan a numeric literal token from the input string.
  @returns {Token} The resulting token.
*/

function scanNumericLiteral() {
  const character = input.charAt(index);
  const next = input.charAt(index + 1);

  const value = (character === '0' && 'xX'.indexOf(next || null) >= 0)
    ? readHexLiteral() : readDecLiteral();

  return new Token(
    'NumericLiteral',
    value,
    tokenStart,
    index,
    new SourceLocation(
      lineStart,
      tokenStart - lineStartIndex,
      line,
      index - lineIndex,
    ),
  );
}

// Lua hexadecimals have an optional fraction part and an optional binary
// exoponent part. These are not included in JavaScript so we will compute
// all three parts separately and then sum them up at the end of the function
// with the following algorithm.
//
//     Digit := toDec(digit)
//     Fraction := toDec(fraction) / 16 ^ fractionCount
//     BinaryExp := 2 ^ binaryExp
//     Number := ( Digit + Fraction ) * BinaryExp

/**
  Reads a Lua hexadecimal literal.
  @returns {number} The hexadecimal literal as a number.
*/

function readHexLiteral() {
  let fraction = 0; // defaults to 0 as it gets summed
  let binaryExponent = 1; // defaults to 1 as it gets multiplied
  let binarySign = 1; // positive
  let digit; let fractionStart; let exponentStart; let
    digitStart;

  digitStart = index += 2; // Skip 0x part

  // A minimum of one hex digit is required.
  if (!isHexDigit(input.charCodeAt(index)) && !options.skipExceptions) raise({}, errors.malformedNumber, input.slice(tokenStart, index));

  while (isHexDigit(input.charCodeAt(index))) index++;
  // Convert the hexadecimal digit to base 10.
  digit = parseInt(input.slice(digitStart, index), 16);

  // Fraction part i optional.
  if (input.charAt(index) === '.') {
    fractionStart = ++index;

    while (isHexDigit(input.charCodeAt(index))) index++;
    fraction = input.slice(fractionStart, index);

    // Empty fraction parts should default to 0, others should be converted
    // 0.x form so we can use summation at the end.
    fraction = (fractionStart === index) ? 0
      : parseInt(fraction, 16) / 16 ** (index - fractionStart);
  }

  // Binary exponents are optional
  if ('pP'.indexOf(input.charAt(index) || null) >= 0) {
    index++;

    // Sign part is optional and defaults to 1 (positive).
    if ('+-'.indexOf(input.charAt(index) || null) >= 0) binarySign = (input.charAt(index++) === '+') ? 1 : -1;

    exponentStart = index;

    // The binary exponent sign requires a decimal digit.
    if (!isDecDigit(input.charCodeAt(index)) && !options.skipExceptions) raise({}, errors.malformedNumber, input.slice(tokenStart, index));

    while (isDecDigit(input.charCodeAt(index))) index++;
    binaryExponent = input.slice(exponentStart, index);

    // Calculate the binary exponent of the number.
    binaryExponent = 2 ** (binaryExponent * binarySign);
  }

  return (digit + fraction) * binaryExponent;
}

// Decimal numbers are exactly the same in Lua and in JavaScript, because of
// this we check where the token ends and then parse it with native
// functions.

/**
  Reads a Lua decimal literal.
  @returns {number} The decimal literal as a number.
*/

function readDecLiteral() {
  while (isDecDigit(input.charCodeAt(index))) index++;
  // Fraction part is optional
  if (input.charAt(index) === '.') {
    index++;
    // Fraction part defaults to 0
    while (isDecDigit(input.charCodeAt(index))) index++;
  }
  // Exponent part is optional.
  if ('eE'.indexOf(input.charAt(index) || null) >= 0) {
    index++;
    // Sign part is optional.
    if ('+-'.indexOf(input.charAt(index) || null) >= 0) index++;
    // An exponent is required to contain at least one decimal digit.
    if (!isDecDigit(input.charCodeAt(index)) && !options.skipExceptions) raise({}, errors.malformedNumber, input.slice(tokenStart, index));

    while (isDecDigit(input.charCodeAt(index))) index++;
  }

  return parseFloat(input.slice(tokenStart, index));
}

// Translate escape sequences to the actual characters.

/**
  Translates escape sequences to the actual characters.
  @returns {string} The unescaped character sequence.
*/

function readEscapeSequence() {
  const sequenceStart = index;
  switch (input.charAt(index)) {
    // Lua allow the following escape sequences.
    // We don't escape the bell sequence.
    case 'n': index++; return '\n';
    case 'r': index++; return '\r';
    case 't': index++; return '\t';
    case 'v': index++; return '\x0B';
    case 'b': index++; return '\b';
    case 'f': index++; return '\f';
    // Skips the following span of white-space.
    case 'z': index++; skipWhiteSpace(); return '';
    // Byte representation should for now be returned as is.
    case 'x':
      // \xXX, where XX is a sequence of exactly two hexadecimal digits
      if (isHexDigit(input.charCodeAt(index + 1))
          && isHexDigit(input.charCodeAt(index + 2))) {
        index += 3;
        // Return it as is, without translating the byte.
        return `\\${input.slice(sequenceStart, index)}`;
      }
      return `\\${input.charAt(index++)}`;
    default:
      // \ddd, where ddd is a sequence of up to three decimal digits.
      if (isDecDigit(input.charCodeAt(index))) {
        while (isDecDigit(input.charCodeAt(++index)));
        return `\\${input.slice(sequenceStart, index)}`;
      }
      // Simply return the \ as is, it's not escaping any sequence.
      return input.charAt(index++);
  }
}

// Comments begin with -- after which it will be decided if they are
// multiline comments or not.
//
// The multiline functionality works the exact same way as with string
// literals so we reuse the functionality.

function scanComment() {
  tokenStart = index;
  lineStart = line;
  index += 2; // --

  const character = input.charAt(index);
  let content = '';
  let isLong = false;
  const commentStart = index;
  const lineStartComment = lineIndex;
  const lineComment = line;

  if (character === '[') {
    content = readLongString();
    // This wasn't a multiline comment after all.
    if (content === false) content = character;
    else isLong = true;
  }
  // Scan until next line as long as it's not a multiline comment.
  if (!isLong) {
    while (index < length) {
      if (isLineTerminator(input.charCodeAt(index))) break;
      index++;
    }
    if (options.comments) content = input.slice(commentStart, index);
  }

  if (options.comments) {
    /*
    return new Token(
      "Comment",
      content,
      tokenStart,
      index,
      new SourceLocation(
        lineStart,
        tokenStart - lineStartIndex,
        line,
        index - lineIndex
      )
    );
    */
  }
}

// Read a multiline string by calculating the depth of `=` characters and
// then appending until an equal depth is found.

function readLongString() {
  let level = 0;
  let content = '';
  let terminator = false;
  let character; let
    stringStart;

  index++; // [

  // Calculate the depth of the comment.
  while (input.charAt(index + level) === '=') level++;
  // Exit, this is not a long string afterall.
  if (input.charAt(index + level) !== '[') return false;

  index += level + 1;

  // If the first character is a newline, ignore it and begin on next line.
  if (isLineTerminator(input.charCodeAt(index))) consumeEOL();

  stringStart = index;
  while (index < length) {
    // To keep track of line numbers run the `consumeEOL()` which increments
    // its counter.
    if (isLineTerminator(input.charCodeAt(index))) consumeEOL();

    character = input.charAt(index++);

    // Once the delimiter is found, iterate through the depth count and see
    // if it matches.
    if (character === ']') {
      terminator = true;
      for (let i = 0; i < level; i++) {
        if (input.charAt(index + i) !== '=') terminator = false;
      }
      if (input.charAt(index + level) !== ']') terminator = false;
    }

    // We reached the end of the multiline string. Get out now.
    if (terminator) break;
  }
  content += input.slice(stringStart, index - 1);
  index += level + 1;

  return content;
}

function skipWhiteSpace() {
  while (index < length) {
    const charCode = input.charCodeAt(index);
    if (isWhiteSpace(charCode)) {
      index++;
    } else if (!consumeEOL()) {
      break;
    }
  }
}

// ### Validation functions

const WhiteSpaceCharCode = {
  HORIZONTAL_TAB: 9,
  SPACE: 32,
  LINE_TABULATION: 0xB,
  FORM_FEED: 0xC,
};

/**
 * Checks if a given character code represents a white space character.
 *
 * @param {number} charCode - The character code to check.
 * @returns {boolean} Whether the character is a white space character.
 */

function isWhiteSpace(charCode) {
  return charCode === WhiteSpaceCharCode.HORIZONTAL_TAB
         || charCode === WhiteSpaceCharCode.SPACE
         || charCode === WhiteSpaceCharCode.LINE_TABULATION
         || charCode === WhiteSpaceCharCode.FORM_FEED;
}

const LineTerminatorCharCode = {
  LINE_FEED: 10,
  CARRIAGE_RETURN: 13,
};

/**
 * Checks if a given character code represents a line terminator character.
 *
 * @param {number} charCode - The character code to check.
 * @returns {boolean} Whether the character is a line terminator character.
 */

function isLineTerminator(charCode) {
  return charCode === LineTerminatorCharCode.LINE_FEED
         || charCode === LineTerminatorCharCode.CARRIAGE_RETURN;
}

const DecDigitCharCode = {
  ZERO: 48,
  NINE: 57,
};

/**
 * Checks if a given character code represents a decimal digit character.
 *
 * @param {number} charCode - The character code to check.
 * @returns {boolean} Whether the character is a decimal digit character.
 */

function isDecDigit(charCode) {
  return charCode >= DecDigitCharCode.ZERO && charCode <= DecDigitCharCode.NINE;
}

const HexDigitCharCode = {
  ZERO: 48,
  NINE: 57,
  LOWERCASE_A: 97,
  LOWERCASE_F: 102,
  UPPERCASE_A: 65,
  UPPERCASE_F: 70,
};

/**
 * Checks if a given character code represents a hexadecimal digit character.
 *
 * @param {number} charCode - The character code to check.
 * @returns {boolean} Whether the character is a hexadecimal digit character.
 */

function isHexDigit(charCode) {
  return (charCode >= HexDigitCharCode.ZERO && charCode <= HexDigitCharCode.NINE)
         || (charCode >= HexDigitCharCode.LOWERCASE_A && charCode <= HexDigitCharCode.LOWERCASE_F)
         || (charCode >= HexDigitCharCode.UPPERCASE_A && charCode <= HexDigitCharCode.UPPERCASE_F);
}

// From [Lua 5.2](http://www.lua.org/manual/5.2/manual.html#8.1) onwards
// identifiers cannot use locale-dependet letters.

const IdentifierStartCharCode = {
  LOWERCASE_A: 97,
  LOWERCASE_Z: 122,
  UPPERCASE_A: 65,
  UPPERCASE_Z: 90,
  UNDERSCORE: 95,
};

/**
 * Checks if a given character code represents the start of a valid identifier.
 *
 * @param {number} charCode - The character code to check.
 * @returns {boolean} Whether the character is the start of a valid identifier.
 */

function isIdentifierStart(charCode) {
  return (charCode >= IdentifierStartCharCode.UPPERCASE_A && charCode <= IdentifierStartCharCode.UPPERCASE_Z)
         || (charCode >= IdentifierStartCharCode.LOWERCASE_A && charCode <= IdentifierStartCharCode.LOWERCASE_Z)
         || charCode === IdentifierStartCharCode.UNDERSCORE;
}

const IdentifierPartCharCode = {
  LOWERCASE_A: 97,
  LOWERCASE_Z: 122,
  UPPERCASE_A: 65,
  UPPERCASE_Z: 90,
  DIGIT_0: 48,
  DIGIT_9: 57,
  UNDERSCORE: 95,
};

/**
 * Checks if a given character code represents a valid part of an identifier.
 *
 * @param {number} charCode - The character code to check.
 * @returns {boolean} Whether the character is a valid part of an identifier.
 */

function isIdentifierPart(charCode) {
  return (charCode >= IdentifierPartCharCode.UPPERCASE_A && charCode <= IdentifierPartCharCode.UPPERCASE_Z)
         || (charCode >= IdentifierPartCharCode.LOWERCASE_A && charCode <= IdentifierPartCharCode.LOWERCASE_Z)
         || (charCode >= IdentifierPartCharCode.DIGIT_0 && charCode <= IdentifierPartCharCode.DIGIT_9)
         || charCode === IdentifierPartCharCode.UNDERSCORE;
}

// [3.1 Lexical Conventions](http://www.lua.org/manual/5.2/manual.html#3.1)
//
// `true`, `false` and `nil` will not be considered keywords, but literals.

const keywords = [
  'do', 'if', 'in', 'of', 'or', '&&', '||', '??',
  'and', 'end', 'for', 'not',
  'else', 'goto', 'then', 'self',
  'break', 'local', 'until', 'while', 'class', 'super', 'await', 'async', 'throw',
  'elseif', 'repeat', 'return', 'static', 'public', 'stopif', 'import',
  'extends', 'breakif',
  'continue', 'function',
  'continueif',
];

const keywordsByLength = keywords.reduce((acc, keyword) => {
  const { length } = keyword;
  if (!acc[length]) {
    acc[length] = [];
  }
  acc[length].push(keyword);
  return acc;
}, {});

/**
 * Checks if a given identifier is a keyword in the Lua language.
 *
 * @param {string} id - The identifier to check.
 * @returns {boolean} Whether the identifier is a keyword.
 */

const isKeyword = (id) => (keywordsByLength[id.length] ? keywordsByLength[id.length].includes(id) : false);

/**
 * Checks if a given token is a unary operator.
 *
 * @param {Token} token - The token to check.
 * @returns {boolean} Whether the token is a unary operator.
 */

function isUnary(token) {
  if (Punctuator === token.type) return '#-~!'.indexOf(token.value) >= 0;
  if (Keyword === token.type) return token.value === 'not';
  return false;
}

/**
 * Tokenizes a given input string according to the Lua language rules.
 *
 * @param {string} [_input=""] - The input string to tokenize.
 * @param {TokenizeOptions} [_options] - Options to configure the tokenizer.
 * @returns {Token[]} An array of tokens representing the input string.
 */

function tokenize(_input, _options) {
  if (typeof _options === 'undefined' && typeof _input === 'object') {
    _options = _input;
    _input = undefined;
  }
  if (!_options) _options = {};

  options = extend(defaultOptions, _options);

  input = _input || '';

  index = 0;
  line = 1;
  lineIndex = 0;
  lineStart = 1;
  lineStartIndex = 0;
  length = input.length;

  lookahead = lex();
  next();

  const tokens = [token];

  while (token.type !== 'EOF') {
    next();
    tokens.push(token);
  }

  return tokens;
}

const tokenizer = {
  tokenize,
  errors,
};

module.exports = tokenizer;
