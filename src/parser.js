import extend from "extend";

import tokenizer from "./tokenizer";
import * as b from "./builder";

let input;
let options;
let length;
let isInClassMethod = false;
let isInClassConstructor = false;
let classConstructorToken;
let classContexts = [];

let currentClassParent;

// Options can be set either globally on the parser object through
// defaultOptions, or during the parse call.
const defaultOptions = {
  // Explicitly tell the parser when the input ends.
  wait: false,
  // Track identifier scopes by adding an isLocal attribute to each
  // identifier-node.
  scope: false,
  // Store location information on each syntax node as
  // `loc: { start: { line, column }, end: { line, column } }`.
  locations: false,
  // Store the start and end character locations on each syntax node as
  // `range: [start, end]`.
  ranges: false,
  // A callback which will be invoked when a syntax node has been completed.
  // The node which has been created will be passed as the only parameter.
  onCreateNode: null,
  // A callback which will be invoked when a new scope is created.
  onCreateScope: null,
  // A callback which will be invoked when the current scope is destroyed.
  onDestroyScope: null,
};

// The available tokens

const EOF = "EOF";
const StringLiteral = "StringLiteral";
const Keyword = "Keyword";
const Identifier = "Identifier";
const NumericLiteral = "NumericLiteral";
const Punctuator = "Punctuator";
const BooleanLiteral = "BooleanLiteral";
const NilLiteral = "NilLiteral";
const VarargLiteral = "VarargLiteral";

// As this parser is a bit different from luas own, the error messages
// will be different in some situations.

const errors = {
  unexpected: "unexpected %1 '%2' near '%3'",
  expected: "'%1' expected near '%2'",
  expectedToken: "%1 expected near '%2'",
  unfinishedString: "unfinished string near '%1'",
  malformedNumber: "malformed number near '%1'",
  invalidVar: "invalid left-hand side of assignment near '%1'",
};

let imports = new Map();

// Wrap up the node object.

function finishNode(node) {
  // Pop a `Marker` off the location-array and attach its location data.
  if (trackLocations) {
    const location = locations.pop();
    location.complete();
    if (options.locations) node.loc = location.loc;
    if (options.ranges) node.range = location.range;
  }
  if (options.onCreateNode) options.onCreateNode(node);
  return node;
}

// Helpers
// -------

const { slice } = Array.prototype;
const indexOf = function indexOf(array, element) {
  for (let i = 0, { length } = array; i < length; i++) {
    if (array[i] === element) return i;
  }
  return -1;
};

// Iterate through an array of objects and return the index of an object
// with a matching property.

function indexOfObject(array, property, element) {
  for (let i = 0, { length } = array; i < length; i++) {
    if (array[i][property] === element) return i;
  }
  return -1;
}

// A sprintf implementation using %index (beginning at 1) to input
// arguments in the format string.
//
// Example:
//
//     // Unexpected function in token
//     sprintf('Unexpected %2 in %1.', 'token', 'function');

function sprintf(format) {
  const args = slice.call(arguments, 1);
  format = format.replace(
    /%(\d)/g,
    (match, index) => `${args[index - 1]}` || "",
  );
  return format;
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
//     raise(token, "expected %1 near %2", '[', token.value);

function raise(token) {
  const message = sprintf.apply(null, slice.call(arguments, 1));
  let error;
  let col;

  let errToken = token;
  let errIndex = errToken.range[0];
  if (token.type == "EOF") {
    errToken = previousToken;
    errIndex = errToken.range[1];
  }

  const { start } = errToken.loc;

  error = new SyntaxError(
    sprintf("[%1:%2] %3", start.line, start.column, message),
  );
  error.index = errIndex;
  error.line = start.line;
  error.column = start.column;
  throw error;
}

// #### Raise an unexpected token error.
//
// Example:
//
//     // expected <name> near '0'
//     raiseUnexpectedToken('<name>', token);

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
  if (typeof near === "undefined") near = lookahead.value;
  if (typeof found.type !== "undefined") {
    let type;
    switch (found.type) {
      case StringLiteral:
        type = "string";
        break;
      case Keyword:
        type = "keyword";
        break;
      case Identifier:
        type = "identifier";
        break;
      case NumericLiteral:
        type = "number";
        break;
      case Punctuator:
        type = "symbol";
        break;
      case BooleanLiteral:
        type = "boolean";
        break;
      case NilLiteral:
        return raise(found, errors.unexpected, "symbol", "nil", near);
    }
    return raise(found, errors.unexpected, type, found.value, near);
  }
  return raise(found, errors.unexpected, "symbol", found, near);
}

let tokens;
let tokenIndex;
let token;
let previousToken;
let lookahead;

// Read the next token.
//
// This is actually done by setting the current token to the lookahead and
// reading in the new lookahead token.

function next() {
  previousToken = token;
  token = lookahead;
  lookahead = nextToken();
}

function nextToken() {
  const t = tokens[Math.min(tokenIndex, tokens.length)] || tokenizer.EOF;
  tokenIndex++;

  return t;
}

// Consume a token if its value matches. Once consumed or not, return the
// success of the operation.

function consume(value) {
  if (value === token.value) {
    next();
    return true;
  }
  return false;
}

// Expect the next token value to match. If not, throw an exception.

function expect(value) {
  if (value === token.value) next();
  else raise(token, errors.expected, value, token.value);
}

// ### Validation functions

function isUnary(token) {
  if (Punctuator === token.type) return "#-~!".indexOf(token.value) >= 0;
  if (Keyword === token.type) return token.value === "not";
  return false;
}

// @TODO this needs to be rethought.
function isCallExpression(expression) {
  switch (expression.type) {
    case "CallExpression":
    case "TableCallExpression":
    case "StringCallExpression":
      return true;
  }
  return false;
}

// Check if the token syntactically closes a block.

function isBlockFollow(token) {
  if (EOF === token.type) return true;
  if (Keyword !== token.type) return false;
  switch (token.value) {
    case "else":
    case "elseif":
    case "end":
    case "until":
      return true;
    default:
      return false;
  }
}

// Scope
// -----

// Store each block scope as a an array of identifier names. Each scope is
// stored in an FILO-array.
let scopes;
// The current scope index
let scopeDepth;
// A list of all global identifier nodes.
let globals;

// Create a new scope inheriting all declarations from the previous scope.
function createScope() {
  const scope = Array.apply(null, scopes[scopeDepth++]);
  scopes.push(scope);
  if (options.onCreateScope) options.onCreateScope();
}

// Exit and remove the current scope.
function destroyScope() {
  const scope = scopes.pop();
  scopeDepth--;
  if (options.onDestroyScope) options.onDestroyScope();
}

// Add identifier name to the current scope if it doesnt already exist.
function scopeIdentifierName(name) {
  if (indexOf(scopes[scopeDepth], name) !== -1) return;
  scopes[scopeDepth].push(name);
}

// Add identifier to the current scope
function scopeIdentifier(node) {
  scopeIdentifierName(node.name);
  attachScope(node, true);
}

// Attach scope information to node. If the node is global, store it in the
// globals array so we can return the information to the user.
function attachScope(node, isLocal) {
  if (!isLocal && indexOfObject(globals, "name", node.name) === -1)
    globals.push(node);

  node.isLocal = isLocal;
}

// Is the identifier name available in this scope.
function scopeHasName(name) {
  return indexOf(scopes[scopeDepth], name) !== -1;
}

// Location tracking
// -----------------
//
// Locations are stored in FILO-array as a `Marker` object consisting of both
// `loc` and `range` data. Once a `Marker` is popped off the list an end
// location is added and the data is attached to a syntax node.

var locations = [];
let trackLocations;

function createLocationMarker() {
  return new Marker(token);
}

function Marker(token) {
  if (options.locations) {
    this.loc = {
      start: {
        line: token.loc.start.line,
        column: token.loc.start.column,
      },
      end: {
        line: 0,
        column: 0,
      },
    };
  }
  if (options.ranges) this.range = [token.range[0], 0];
}

// Complete the location data stored in the `Marker` by adding the location
// of the *previous token* as an end location.
Marker.prototype.complete = function () {
  if (options.locations) {
    this.loc.end.line = previousToken ? previousToken.loc.end.line : 1;
    this.loc.end.column = previousToken ? previousToken.loc.end.column : 0;
  }
  if (options.ranges) {
    this.range[1] = previousToken ? previousToken.range[1] : 0;
  }
};

// Create a new `Marker` and add it to the FILO-array.
function markLocation() {
  if (trackLocations) locations.push(createLocationMarker());
}

// Push an arbitrary `Marker` object onto the FILO-array.
function pushLocation(marker) {
  if (trackLocations) locations.push(marker);
}

// Parse functions
// ---------------

function parseFile() {
  imports = new Map();
  next();
  markLocation();
  const chunk = parseChunk();
  if (EOF !== token.type) unexpected(token);
  return finishNode(b.file(chunk));
}

// Chunk is the main program object. Syntactically it's the same as a block.
//
//     chunk ::= block

function parseChunk() {
  markLocation();
  if (options.scope) createScope();
  const body = parseBlock();
  if (options.scope) destroyScope();
  if (EOF !== token.type) unexpected(token);
  // If the body is empty no previousToken exists when finishNode runs.
  if (trackLocations && !body.length) previousToken = token;
  return finishNode(b.chunk(body));
}

// A block contains a list of statements with an optional return statement
// as its last statement.
//
//     block ::= {stat} [retstat]

function parseBlock(terminator) {
  const block = [];
  let statement;

  while (!isBlockFollow(token)) {
    // Return has to be the last statement in a block.
    if (token.value === "return") {
      block.push(parseStatement());
      break;
    }
    statement = parseStatement();
    // Statements are only added if they are returned, this allows us to
    // ignore some statements, such as EmptyStatement.
    if (statement) block.push(statement);
  }

  // Doesn't really need an ast node
  return block;
}

// There are two types of statements, simple and compound.
//
//     statement ::= break | goto | do | while | repeat | return
//          | if | for | function | local | label | assignment
//          | functioncall | ';'

function parseStatement() {
  markLocation();
  if (Keyword === token.type) {
    switch (token.value) {
      case "local":
        next();
        return parseLocalStatement();
      case "if":
        next();
        return parseIfStatement();
      case "return":
        next();
        return parseReturnStatement();
      case "function":
        next();
        var name = parseFunctionName();
        return parseFunctionDeclaration(name);
      case "while":
        next();
        return parseWhileStatement();
      case "for":
        next();
        return parseForStatement();
      case "repeat":
        next();
        return parseRepeatStatement();
      case "break":
        next();
        return parseBreakStatement();
      case "continue":
        next();
        return parseContinueStatement();
      case "do":
        next();
        return parseDoStatement();
      case "goto":
        next();
        return parseGotoStatement();
      case "public":
        next();
        return parseClassStatement(true);
      case "class":
        next();
        return parseClassStatement(false);
      case "async":
        next();
        return parseAsyncStatement();
      case "throw":
        next();
        return parseThrowStatement();
      case "import":
        next();
        parseImportStatement();
        return;
      // Shortcuts
      case "stopif":
        next();
        return parseStopIfStatement();
      case "breakif":
        next();
        return parseBreakIfStatement();
      case "continueif":
        next();
        return parseContinueIfStatement();
    }
  }

  if (Punctuator === token.type) {
    if (consume("::")) return parseLabelStatement();
    if (consume("@")) return parseDecoratorStatement();
  }

  // Assignments memorizes the location and pushes it manually for wrapper
  // nodes. Additionally empty `;` statements should not mark a location.
  if (trackLocations) locations.pop();

  // When a `;` is encounted, simply eat it without storing it.
  if (consume(";")) return;

  return parseAssignmentOrCallStatement();
}

function parseAsyncStatement(decorators) {
  expect("function");
  const name = parseFunctionName();
  return parseFunctionDeclaration(name, undefined, undefined, true, decorators);
}

function parseImportStatement() {
  const identifiers = [];

  if (token.value !== "end") {
    let identifier = parseIdentifier();
    if (identifier != null) identifiers.push(identifier);
    while (consume(",")) {
      identifier = parseExpectedExpression();
      identifiers.push(identifier);
    }
    consume(";"); // grammar tells us ; is optional here.
  }

  expect("from");

  const expression = parseExpectedExpression();
  for (const identifier of identifiers) {
    imports.set(identifier.name, expression);
  }

  return finishNode(b.importStatement(identifiers, expression));
}

function parseThrowStatement() {
  const expressions = [];

  if (token.value !== "end") {
    let expression = parseExpression();
    if (expression != null) expressions.push(expression);
    while (consume(",")) {
      expression = parseExpectedExpression();
      expressions.push(expression);
    }
    consume(";"); // grammar tells us ; is optional here.
  }

  return finishNode(b.throwStatement(expressions));
}

function parseThrowExpression() {
  return parseThrowStatement();
}

// ## Statements

//     label ::= '::' Name '::'

function parseLabelStatement() {
  const name = token.value;
  const label = parseIdentifier();

  if (options.scope) {
    scopeIdentifierName(`::${name}::`);
    attachScope(label, true);
  }

  expect("::");
  return finishNode(b.labelStatement(label));
}

//     decorator ::= '@' exp

function parseDecoratorStatement() {
  const decorator = parseExpectedExpression();
  const decorators = [decorator];

  if (consume("local")) return parseLocalStatement(decorators);
  if (consume("async")) return parseAsyncStatement(decorators);

  expect("function");
  const name = parseFunctionName();
  return parseFunctionDeclaration(
    name,
    undefined,
    undefined,
    undefined,
    decorators,
  );
}

//     break ::= 'break'

function parseBreakStatement() {
  return finishNode(b.breakStatement());
}

//     continue ::= 'continue'

function parseContinueStatement() {
  return finishNode(b.continueStatement());
}

//     goto ::= 'goto' Name

function parseGotoStatement() {
  const name = token.value;
  const label = parseIdentifier();

  return finishNode(b.gotoStatement(label));
}

//     do ::= 'do' block 'end'

function parseDoStatement() {
  if (options.scope) createScope();
  const body = parseBlock();
  if (options.scope) destroyScope();
  expect("end");
  return finishNode(b.doStatement(body));
}

//     while ::= 'while' exp 'do' block 'end'

function parseWhileStatement() {
  const condition = parseExpectedExpression();
  expect("do");
  if (options.scope) createScope();
  const body = parseBlock();
  if (options.scope) destroyScope();
  expect("end");
  return finishNode(b.whileStatement(condition, body));
}

//     repeat ::= 'repeat' block 'until' exp

function parseRepeatStatement() {
  if (options.scope) createScope();
  const body = parseBlock();
  expect("until");
  const condition = parseExpectedExpression();
  if (options.scope) destroyScope();
  return finishNode(b.repeatStatement(condition, body));
}

//     retstat ::= 'return' [exp {',' exp}] [';']

function parseReturnStatement() {
  const expressions = [];

  if (token.value !== "end") {
    let expression = parseExpression();
    if (expression != null) expressions.push(expression);
    while (consume(",")) {
      expression = parseExpectedExpression();
      expressions.push(expression);
    }
    consume(";"); // grammar tells us ; is optional here.
  }
  return finishNode(b.returnStatement(expressions));
}

function parseStopIfStatement() {
  const expressions = [];

  if (token.value !== "end") {
    let expression = parseExpression();
    if (expression != null) expressions.push(expression);
    while (consume(",")) {
      expression = parseExpectedExpression();
      expressions.push(expression);
    }
    consume(";"); // grammar tells us ; is optional here.
  }

  return finishNode(b.stopIfStatement(expressions));
}

function parseBreakIfStatement() {
  const expressions = [];

  if (token.value !== "end") {
    let expression = parseExpression();
    if (expression != null) expressions.push(expression);
    while (consume(",")) {
      expression = parseExpectedExpression();
      expressions.push(expression);
    }
    consume(";"); // grammar tells us ; is optional here.
  }

  return finishNode(b.breakIfStatement(expressions));
}

function parseContinueIfStatement() {
  const expressions = [];

  if (token.value !== "end") {
    let expression = parseExpression();
    if (expression != null) expressions.push(expression);
    while (consume(",")) {
      expression = parseExpectedExpression();
      expressions.push(expression);
    }
    consume(";"); // grammar tells us ; is optional here.
  }

  return finishNode(b.continueIfStatement(expressions));
}

//     if ::= 'if' exp 'then' block {elif} ['else' block] 'end'
//     elif ::= 'elseif' exp 'then' block

function parseIfStatement() {
  const clauses = [];
  let condition;
  let body;
  let marker;

  // IfClauses begin at the same location as the parent IfStatement.
  // It ends at the start of `end`, `else`, or `elseif`.
  if (trackLocations) {
    marker = locations[locations.length - 1];
    locations.push(marker);
  }
  condition = parseExpectedExpression();
  expect("then");
  if (options.scope) createScope();
  body = parseBlock();
  if (options.scope) destroyScope();
  clauses.push(finishNode(b.ifClause(condition, body)));

  if (trackLocations) marker = createLocationMarker();
  while (consume("elseif")) {
    pushLocation(marker);
    condition = parseExpectedExpression();
    expect("then");
    if (options.scope) createScope();
    body = parseBlock();
    if (options.scope) destroyScope();
    clauses.push(finishNode(b.elseifClause(condition, body)));
    if (trackLocations) marker = createLocationMarker();
  }

  if (consume("else")) {
    // Include the `else` in the location of ElseClause.
    if (trackLocations) {
      marker = new Marker(previousToken);
      locations.push(marker);
    }
    if (options.scope) createScope();
    body = parseBlock();
    if (options.scope) destroyScope();
    clauses.push(finishNode(b.elseClause(body)));
  }

  expect("end");
  return finishNode(b.ifStatement(clauses));
}

// There are two types of for statements, generic and numeric.
//
//     for ::= Name '=' exp ',' exp [',' exp] 'do' block 'end'
//     for ::= namelist 'in' explist 'do' block 'end'
//     namelist ::= Name {',' Name}
//     explist ::= exp {',' exp}

function parseForStatement() {
  let variable = parseIdentifier();
  let body;

  // The start-identifier is local.

  if (options.scope) {
    createScope();
    scopeIdentifier(variable);
  }

  // If the first expression is followed by a `=` punctuator, this is a
  // Numeric For Statement.
  if (consume("=")) {
    // Start expression
    const start = parseExpectedExpression();
    expect(",");
    // End expression
    const end = parseExpectedExpression();
    // Optional step expression
    const step = consume(",") ? parseExpectedExpression() : null;

    expect("do");
    body = parseBlock();
    expect("end");
    if (options.scope) destroyScope();

    return finishNode(b.forNumericStatement(variable, start, end, step, body));
  }
  // If not, it's a Generic For Statement

  // The namelist can contain one or more identifiers.
  const variables = [variable];
  while (consume(",")) {
    variable = parseIdentifier();
    // Each variable in the namelist is locally scoped.
    if (options.scope) scopeIdentifier(variable);
    variables.push(variable);
  }

  if (consume("in")) {
    const iterators = [];

    // One or more expressions in the explist.
    do {
      var expression = parseExpectedExpression();
      iterators.push(expression);
    } while (consume(","));

    expect("do");
    body = parseBlock();
    expect("end");
    if (options.scope) destroyScope();

    return finishNode(b.forGenericStatement(variables, iterators, body));
  }
  if (consume("of")) {
    var expression = parseExpectedExpression();

    expect("do");
    body = parseBlock();
    expect("end");
    if (options.scope) destroyScope();

    return finishNode(b.forOfStatement(variables, expression, body));
  }

  raiseUnexpectedToken("'in' or 'of'", token);
}

function parseClassStatement(isPublic) {
  if (isPublic) {
    expect("class");
  }

  let marker;
  const identifier = parseExpectedExpression();
  let parent;

  if (options.scope) scopeIdentifier(identifier);

  if (trackLocations) marker = createLocationMarker();

  if (consume("extends")) {
    parent = parseExpectedExpression();
    currentClassParent = parent;

    if (options.scope) scopeIdentifier(parent);
  }

  let statement;
  const body = [];

  while (!isBlockFollow(token)) {
    if (options.scope) createScope();
    statement = parseClassBodyStatement();

    // Statements are only added if they are returned, this allows us to
    // ignore some statements, such as EmptyStatement.
    if (statement) {
      body.push(statement);
    }
  }

  expect("end");

  currentClassParent = null;
  return finishNode(b.classStatement(identifier, parent, body, isPublic));
}

function parseClassBodyStatement() {
  if (trackLocations) marker = createLocationMarker();
  pushLocation(marker);

  let visibility;
  if (consume("private")) {
    visibility = "PRIVATE";
  } else {
    consume("public");
    visibility = "PUBLIC";
  }
  const isStatic = consume("static");
  const get = consume("_get");
  const set = consume("_set");

  if (token.value == "constructor") classConstructorToken = token;
  const isAsync = consume("async");
  const expression = parseIdentifier();
  const isConstructor = expression.name === "constructor";

  let statement;

  if (get || set) {
    statement = b.classGetSetStatement(expression, get, set);
  } else if (token.value == "=") {
    var marker;

    const identifier = expression;
    let exp;

    validateVar(expression);
    expect("=");
    exp = parseExpectedExpression();

    statement = b.classMemberStatement(identifier, exp, isStatic);
  } else {
    if (isConstructor) isInClassConstructor = true;
    isInClassMethod = true;

    statement = parseClassMethodStatement(
      expression,
      isStatic,
      isConstructor,
      isAsync,
      visibility,
    );

    isInClassMethod = false;
    isInClassConstructor = false;
  }

  classConstructorToken = null;

  return finishNode(statement);
}

function parseClassMethodStatement(
  expression,
  isStatic,
  isConstructor,
  async,
  visibility,
) {
  let marker;
  const parameters = [];

  if (trackLocations) marker = createLocationMarker();
  pushLocation(marker);

  expect("(");

  // The declaration has arguments
  if (!consume(")")) {
    // Arguments are a comma separated list of identifiers, optionally ending
    // with a vararg.
    while (true) {
      if (Identifier === token.type) {
        const parameter = parseIdentifier();
        // Function parameters are local.
        if (options.scope) scopeIdentifier(parameter);

        if (consume("=")) {
          var exp = parseExpectedExpression();

          parameter.defaultValue = exp;
        }
        if (consume(":")) {
          var exp = parseExpectedExpression();

          parameter.typeCheck = exp;
        }

        parameters.push(parameter);

        if (consume(",")) continue;
        else if (consume(")")) break;
      }
      // No arguments are allowed after a vararg.
      else if (VarargLiteral === token.type) {
        parameters.push(parsePrimaryExpression());
        expect(")");
        break;
      } else {
        raiseUnexpectedToken("<name> or '...'", token);
      }
    }
  }

  const body = parseBlock();
  expect("end");
  if (options.scope) destroyScope();

  if (isConstructor) {
    return finishNode(
      b.classMethodStatement(
        expression,
        "constructor",
        parameters,
        body,
        false,
        async,
        visibility,
      ),
    );
  }

  return finishNode(
    b.classMethodStatement(
      expression,
      "method",
      parameters,
      body,
      isStatic,
      async,
      visibility,
    ),
  );
}

// Local statements can either be variable assignments or function
// definitions. If a function definition is found, it will be delegated to
// `parseFunctionDeclaration()` with the isLocal flag.
//
// This AST structure might change into a local assignment with a function
// child.
//
//     local ::= 'local' 'function' Name funcdecl
//        | 'local' Name {',' Name} ['=' exp {',' exp}]

function parseLocalStatement(decorators) {
  let name;

  if (Identifier === token.type || token.value == "{") {
    const variables = [];

    // Check for table destructor
    if (consume("{")) {
      do {
        name = parseIdentifier();

        variables.push(name);
      } while (consume(","));

      expect("}");
      expect("=");

      var expression = parseExpectedExpression();

      // Declarations doesn't exist before the statement has been evaluated.
      // Therefore assignments can't use their declarator. And the identifiers
      // shouldn't be added to the scope until the statement is complete.
      if (options.scope) {
        for (var i = 0, l = variables.length; i < l; i++) {
          scopeIdentifier(variables[i]);
        }
      }

      return finishNode(b.localDestructorStatement(variables, expression));
    }

    const init = [];
    do {
      name = parseIdentifier();

      variables.push(name);
    } while (consume(","));

    if (consume("=")) {
      do {
        var expression = parseExpectedExpression();
        init.push(expression);
      } while (consume(","));
    }

    // Declarations doesn't exist before the statement has been evaluated.
    // Therefore assignments can't use their declarator. And the identifiers
    // shouldn't be added to the scope until the statement is complete.
    if (options.scope) {
      for (var i = 0, l = variables.length; i < l; i++) {
        scopeIdentifier(variables[i]);
      }
    }

    return finishNode(b.localStatement(variables, init));
  }
  if (consume("async")) {
    next();

    name = parseIdentifier();
    if (options.scope) {
      scopeIdentifier(name);
      createScope();
    }

    // MemberExpressions are not allowed in local function statements.
    return parseFunctionDeclaration(name, true, undefined, true, decorators);
  }
  if (consume("function")) {
    name = parseIdentifier();

    if (options.scope) {
      scopeIdentifier(name);
      createScope();
    }

    // MemberExpressions are not allowed in local function statements.
    return parseFunctionDeclaration(
      name,
      true,
      undefined,
      undefined,
      decorators,
    );
  }
  raiseUnexpectedToken("<name>", token);
}

function validateVar(node) {
  // @TODO we need something not dependent on the exact AST used. see also isCallExpression()
  if (
    node.inParens ||
    ["Identifier", "MemberExpression", "IndexExpression"].indexOf(node.type) ===
      -1
  ) {
    raise(token, errors.invalidVar, token.value);
  }
}

//     assignment ::= varlist '=' explist
//     var ::= Name | prefixexp '[' exp ']' | prefixexp '.' Name
//     varlist ::= var {',' var}
//     explist ::= exp {',' exp}
//
//     call ::= callexp
//     callexp ::= prefixexp args | prefixexp ':' Name args

function parseAssignmentOrCallStatement() {
  // Keep a reference to the previous token for better error messages in case
  // of invalid statement
  const previous = token;
  let expression;
  let marker;

  if (trackLocations) marker = createLocationMarker();
  expression = parsePrefixExpression();

  if (expression == null) return unexpected(token);
  if (token.value == "++") {
    validateVar(expression);

    next();
    pushLocation(marker);
    return finishNode(
      b.mutationStatement(expression, "+", b.literal(NumericLiteral, 1, "1")),
    );
  }
  if (",=".indexOf(token.value) >= 0) {
    const variables = [expression];
    const init = [];
    var exp;

    validateVar(expression);
    while (consume(",")) {
      exp = parsePrefixExpression();
      if (exp == null) raiseUnexpectedToken("<expression>", token);
      validateVar(exp);
      variables.push(exp);
    }
    expect("=");
    do {
      exp = parseExpectedExpression();
      init.push(exp);
    } while (consume(","));

    pushLocation(marker);
    return finishNode(b.assignmentStatement(variables, init));
  }

  if ("+=-=*=/=%=||=..=??=".indexOf(token.value) >= 0) {
    const sign = token.value.substring(0, token.value.length - 1);
    validateVar(expression);

    next();
    var exp = parseExpectedExpression();

    pushLocation(marker);
    return finishNode(b.mutationStatement(expression, sign, exp));
  }

  if (isCallExpression(expression)) {
    pushLocation(marker);
    return finishNode(b.callStatement(expression));
  }
  if (expression.type == "TableDestructorStatement") {
    return expression;
  }
  // The prefix expression was neither part of an assignment or a
  // callstatement, however as it was valid it's been consumed, so raise
  // the exception on the previous token to provide a helpful message.
  return unexpected(previous);
}

// ### Non-statements

//     Identifier ::= Name

function parseIdentifier() {
  markLocation();
  const identifier = token.value;
  if (Identifier !== token.type) raiseUnexpectedToken("<name>", token);

  next();

  if (imports.has(identifier)) {
    const expression = imports.get(identifier);
    const node = b.memberExpression(expression, ".", b.identifier(identifier));

    return finishNode(node);
  }

  return finishNode(b.identifier(identifier));
}

function parseSuperExpression() {
  markLocation();
  next();

  if (".()".indexOf(token.value) == -1) {
    raiseUnexpectedToken("<name>", token);
  }

  return finishNode(b.superExpression());
}

function parseSelfExpression() {
  markLocation();
  next();

  return finishNode(b.selfExpression());
}

// Parse the functions parameters and body block. The name should already
// have been parsed and passed to this declaration function. By separating
// this we allow for anonymous functions in expressions.
//
// For local functions there's a boolean parameter which needs to be set
// when parsing the declaration.
//
//     funcdecl ::= '(' [parlist] ')' block 'end'
//     parlist ::= Name {',' Name} | [',' '...'] | '...'

function parseFunctionDeclaration(
  name,
  isLocal,
  isExpression,
  isAsync,
  decorators,
) {
  const parameters = [];
  expect("(");

  // The declaration has arguments
  if (!consume(")")) {
    // Arguments are a comma separated list of identifiers, optionally ending
    // with a vararg.
    while (true) {
      if (Identifier === token.type) {
        var parameter = parseIdentifier();
        // Function parameters are local.
        if (options.scope) scopeIdentifier(parameter);

        if (consume("=")) {
          var exp = parseExpectedExpression();

          parameter.defaultValue = exp;
        }
        if (consume(":")) {
          var exp = parseExpectedExpression();

          parameter.typeCheck = exp;
        }

        parameters.push(parameter);

        if (consume(",")) continue;
        else if (consume(")")) break;
      }
      // Self variabels cannot have default variables
      else if (Keyword === token.type && token.value === "self") {
        var parameter = parseSelfExpression();
        // Function parameters are local
        if (options.scope) scopeIdentifier(parameter);

        parameters.push(parameter);

        if (consume(",")) continue;
        else if (consume(")")) break;
      }
      // No arguments are allowed after a vararg.
      else if (VarargLiteral === token.type) {
        const temp = lookahead;
        const param = parsePrimaryExpression();
        if (param.type == "SpreadExpression") {
          unexpected(temp);
        }
        parameters.push(param);
        expect(")");
        break;
      } else {
        raiseUnexpectedToken("<name> or '...'", token);
      }
    }
  }

  const body = parseBlock();
  expect("end");
  if (options.scope) destroyScope();

  isLocal = isLocal || false;

  if (isExpression) {
    const node = b.functionExpression(parameters, isLocal, body);
    node.async = isAsync;
    node.blockAsync = isAsync;
    return finishNode(node);
  }

  const node = b.functionDeclaration(name, parameters, isLocal, body);
  node.async = isAsync;
  node.blockAsync = isAsync;
  node.decorators = decorators;
  return finishNode(node);
}

// Parse the function name as identifiers and member expressions.
//
//     Name {'.' Name} [':' Name]

function parseFunctionName() {
  let base;
  let name;
  let marker;

  if (trackLocations) marker = createLocationMarker();
  base = parseIdentifier();

  if (options.scope) {
    attachScope(base, scopeHasName(base.name));
    createScope();
  }

  while (consume(".")) {
    pushLocation(marker);
    name = parseIdentifier();
    base = finishNode(b.memberExpression(base, ".", name));
  }

  if (consume(":")) {
    pushLocation(marker);
    name = parseIdentifier();
    base = finishNode(b.memberExpression(base, ":", name));
    if (options.scope) scopeIdentifierName("self");
  }

  return base;
}

//     tableconstructor ::= '{' [fieldlist] '}'
//     fieldlist ::= field {fieldsep field} fieldsep
//     field ::= '[' exp ']' '=' exp | Name = 'exp' | exp
//
//     fieldsep ::= ',' | ';'

function parseTableConstructor() {
  const fields = [];
  let key;
  let value;

  while (true) {
    markLocation();
    if (Punctuator === token.type && consume("[")) {
      key = parseExpectedExpression();
      expect("]");
      expect("=");
      value = parseExpectedExpression();
      fields.push(finishNode(b.tableKey(key, value)));
    } else if (Identifier === token.type) {
      if (lookahead.value === "=") {
        key = parseIdentifier();
        next();
        value = parseExpectedExpression();
        fields.push(finishNode(b.tableKeyString(key, value)));
      } else {
        value = parseExpectedExpression();
        fields.push(finishNode(b.tableValue(value)));
      }
    } else {
      if ((value = parseExpression()) == null) {
        locations.pop();
        break;
      }
      if (value.type == "SpreadExpression") {
        fields.push(finishNode(b.tableSpreadExpression(value.expression)));
      } else {
        fields.push(finishNode(b.tableValue(value)));
      }
    }
    if (",;".indexOf(token.value) >= 0) {
      next();
      continue;
    }
    break;
  }
  expect("}");
  return finishNode(b.tableConstructorExpression(fields));
}

// Expression parser
// -----------------
//
// Expressions are evaluated and always return a value. If nothing is
// matched null will be returned.
//
//     exp ::= (unop exp | primary | prefixexp ) { binop exp }
//
//     primary ::= nil | false | true | Number | String | '...'
//          | functiondef | tableconstructor
//
//     prefixexp ::= (Name | '(' exp ')' ) { '[' exp ']'
//          | '.' Name | ':' Name args | args }
//

function parseExpression() {
  const expression = parseSubExpression(0);
  return expression;
}

// Parse an expression expecting it to be valid.

function parseExpectedExpression() {
  const expression = parseExpression();
  if (expression == null) raiseUnexpectedToken("<expression>", token);
  else return expression;
}

// Return the precedence priority of the operator.
//
// As unary `-` can't be distinguished from binary `-`, unary precedence
// isn't described in this table but in `parseSubExpression()` itself.
//
// As this function gets hit on every expression it's been optimized due to
// the expensive CompareICStub which took ~8% of the parse time.

function binaryPrecedence(operator) {
  const charCode = operator.charCodeAt(0);
  const { length } = operator;

  if (length === 1) {
    switch (charCode) {
      case 94:
        return 12; // ^
      case 42:
      case 47:
      case 37:
        return 10; // * / %
      case 43:
      case 45:
        return 9; // + -
      case 38:
        return 6; // &
      case 126:
        return 5; // ~
      case 124:
        return 4; // |
      case 60:
      case 62:
        return 3; // < >
    }
  } else if (length === 2) {
    switch (charCode) {
      case 47:
        return 10; // //
      case 46:
        return 8; // ..
      case 60:
      case 62:
        if (operator === "<<" || operator === ">>") return 7; // << >>
        return 3; // <= >=
      case 61:
      case 126:
      case 33:
        return 3; // == ~=
      case 111:
        return 1; // or
      case 124:
        return 1; // ||
      case 38:
        return 1; // &&
      case 63:
        return 6; // ??
    }
  } else if (charCode === 97 && operator === "and") return 2;
  return 0;
}

// Implement an operator-precedence parser to handle binary operator
// precedence.
//
// We use this algorithm because it's compact, it's fast and Lua core uses
// the same so we can be sure our expressions are parsed in the same manner
// without excessive amounts of tests.
//
//     exp ::= (unop exp | primary | prefixexp ) { binop exp }

function parseSubExpression(minPrecedence) {
  let operator = token.value;
  // The left-hand side in binary operations.
  let expression;
  let marker;

  if (trackLocations) marker = createLocationMarker();

  // UnaryExpression
  if (isUnary(token)) {
    markLocation();
    next();
    const argument = parseSubExpression(10);
    if (argument == null) raiseUnexpectedToken("<expression>", token);
    expression = finishNode(b.unaryExpression(operator, argument));
  }

  if (expression == null) {
    // PrimaryExpression
    expression = parsePrimaryExpression();

    // PrefixExpression
    if (expression == null) {
      expression = parsePrefixExpression();
    }
  }
  // This is not a valid left hand expression.
  if (expression == null) return null;

  let precedence;
  while (true) {
    operator = token.value;

    precedence =
      Punctuator === token.type || Keyword === token.type
        ? binaryPrecedence(operator)
        : 0;

    if (precedence === 0 || precedence <= minPrecedence) break;
    // Right-hand precedence operators
    if (operator === "^" || operator === "..") precedence--;
    next();

    const right = parseSubExpression(precedence);
    if (right == null) raiseUnexpectedToken("<expression>", token);
    // Push in the marker created before the loop to wrap its entirety.
    if (trackLocations) locations.push(marker);
    expression = finishNode(b.binaryExpression(operator, expression, right));
  }

  return expression;
}

function parseFatArrowFunction(params) {
  if (consume("=>")) {
    if (options.scope) createScope();
    const body = parseBlock();
    if (options.scope) destroyScope();

    expect("end");
    return b.fatArrowExpression(params, body);
  }
}

function parseThinArrowFunction(params) {
  if (consume("->")) {
    if (options.scope) createScope();
    const body = parseBlock();
    if (options.scope) destroyScope();

    expect("end");
    return b.thinArrowExpression([b.identifier("self")].concat(params), body);
  }
}

//     prefixexp ::= prefix {suffix}
//     prefix ::= Name | '(' exp ')'
//     suffix ::= '[' exp ']' | '.' Name | ':' Name args | args
//
//     args ::= '(' [explist] ')' | tableconstructor | String

function parsePrefixExpression() {
  let base;
  let name;
  let marker;

  if (trackLocations) marker = createLocationMarker();

  // The prefix
  if (Identifier === token.type) {
    name = token.value;
    base = parseIdentifier();
    // Set the parent scope.
    if (options.scope) attachScope(base, scopeHasName(name));
  } else if (Keyword == token.type) {
    if (token.value == "super") {
      name = token.value;
      base = parseSuperExpression();
      // Set the parent scope.
      if (options.scope) attachScope(base, scopeHasName(name));
    } else if (token.value == "self") {
      name = token.value;
      base = parseSelfExpression();
      // Set the parent scope.
      if (options.scope) attachScope(base, scopeHasName(name));
    }
  } else if (consume("(")) {
    if (Identifier == token.type || "...)".indexOf(token.value) >= 0) {
      const parameters = [];
      const tokens = [];
      const commaTokens = [];

      // The declaration has arguments
      if (!consume(")")) {
        // Arguments are a comma separated list of identifiers, optionally ending
        // with a vararg.

        do {
          if (VarargLiteral === token.type) {
            const temp = lookahead;
            tokens.push(token);

            const param = parsePrimaryExpression();
            if (param.type == "SpreadExpression") {
              unexpected(temp);
            }
            parameters.push(param);
            break;
          } else {
            tokens.push(token);
            const parameter = parseExpectedExpression();
            if (consume("=")) {
              var exp = parseExpectedExpression();
              parameter.defaultValue = exp;
            }
            if (consume(":")) {
              var exp = parseExpectedExpression();

              parameter.typeCheck = exp;
            }

            parameters.push(parameter);
          }

          if (token.value === ",") {
            commaTokens.push(token);
          }
        } while (consume(","));

        expect(")");
      }

      const fatArrowExpression = parseFatArrowFunction(parameters);
      const thinArrowExpression = parseThinArrowFunction(parameters);
      if (fatArrowExpression || thinArrowExpression) {
        pushLocation(marker);

        for (const i in tokens) {
          const t = tokens[i];
          if (t.type != Identifier && t.type != VarargLiteral)
            raiseUnexpectedToken("<name> or '...'", t);
        }
        return finishNode(fatArrowExpression || thinArrowExpression);
      }
      if (commaTokens.length > 0) {
        raiseUnexpectedToken("')'", commaTokens[0]);
      }

      base = parameters[0];
      base.inParens = true;

      /* expect('=>');

      if (options.scope) createScope();
      var body = parseBlock();
      if (options.scope) destroyScope();

      expect('end');
      return finishNode(b.fatArrowExpression(parameters, body)); */
    } else {
      base = parseExpectedExpression();
      expect(")");
      base.inParens = true; // XXX: quick and dirty. needed for validateVar
    }
  } else {
    return null;
  }

  // The suffix
  let expression;
  let identifier;
  while (true) {
    if (Punctuator === token.type) {
      switch (token.value) {
        case "[":
          pushLocation(marker);
          next();
          expression = parseExpectedExpression();
          base = finishNode(b.indexExpression(base, expression));
          expect("]");
          break;
        case "?.":
          pushLocation(marker);
          next();
          identifier = parseIdentifier();
          base = finishNode(b.safeMemberExpression(base, ".", identifier));
          break;
        case "?:":
          pushLocation(marker);
          next();
          expression = parseExpectedExpression();
          base = finishNode(b.safeMemberExpression(base, ".", expression));
          break;
        case "?[":
          pushLocation(marker);
          next();
          expression = parseExpectedExpression();
          base = finishNode(b.safeMemberExpression(base, ".", expression));
          expect("]");
          break;
        case ".":
          pushLocation(marker);
          next();
          identifier = parseIdentifier();
          base = finishNode(b.memberExpression(base, ".", identifier));
          break;
        case ":":
          pushLocation(marker);
          next();
          identifier = parseIdentifier();
          base = finishNode(b.memberExpression(base, ":", identifier));
          // Once a : is found, this has to be a CallExpression, otherwise
          // throw an error.
          pushLocation(marker);
          base = parseCallExpression(base);
          break;
        case "(":
        case "{": // args
          pushLocation(marker);
          base = parseCallExpression(base);
          break;
        default:
          return base;
      }
    } else if (StringLiteral === token.type) {
      pushLocation(marker);
      base = parseCallExpression(base);
    } else {
      break;
    }
  }

  return base;
}

//     args ::= '(' [explist] ')' | tableconstructor | String

function parseCallExpression(base) {
  let first = base;

  if (first.type == "MemberExpression") {
    while (first) {
      if (!first.base) break;
      first = first.base;
    }
  }

  if (Punctuator === token.type) {
    switch (token.value) {
      case "(":
        next();

        // List of expressions
        var expressions = [];
        var expression = parseExpression();
        if (expression != null) expressions.push(expression);
        while (consume(",")) {
          expression = parseExpectedExpression();
          expressions.push(expression);
        }

        expect(")");

        return finishNode(b.callExpression(base, expressions));

      case "{":
        markLocation();
        next();
        var table = parseTableConstructor();

        return finishNode(b.tableCallExpression(base, table));
    }
  } else if (StringLiteral === token.type) {
    return finishNode(b.stringCallExpression(base, parsePrimaryExpression()));
  }

  raiseUnexpectedToken("function arguments", token);
}

//     primary ::= String | Numeric | nil | true | false
//          | functiondef | tableconstructor | '...'

function parsePrimaryExpression() {
  const { value } = token;
  const { type } = token;
  let marker;

  const tok = token;

  if (trackLocations) marker = createLocationMarker();

  if (
    type == StringLiteral ||
    type == NumericLiteral ||
    type == BooleanLiteral ||
    type == NilLiteral ||
    type == VarargLiteral
  ) {
    pushLocation(marker);
    const raw = input.slice(token.range[0], token.range[1]);
    next();

    if (type == StringLiteral) {
      if (tok.isTemplate) {
        const regexTemplate = /\$\{[a-zA-Z0-9_.():"']+\}/g;
        let match;
        const innerRaw = raw.slice(1, raw.length - 1);

        const expressions = [];
        let lastIdx = 0;
        while ((match = regexTemplate.exec(value))) {
          const matchStr = match[0];

          var str = value.substring(lastIdx, match.index);
          const str2 = value.substring(lastIdx, match.index);
          if (str != "") {
            expressions.push(
              b.literal(StringLiteral, str, JSON.stringify(str)),
            );
          }
          lastIdx = match.index + matchStr.length;

          expressions.push(b.identifier(matchStr.slice(2, -1)));
        }

        var str = value.slice(lastIdx);
        if (str != "") {
          expressions.push(b.literal(StringLiteral, str, JSON.stringify(str)));
        }

        return finishNode(b.templateStringLiteral(expressions));
      }
    } else if (type == VarargLiteral) {
      var exp = parseExpression();

      if (exp !== null) return finishNode(b.spreadExpression(exp));
    }

    return finishNode(b.literal(type, value, raw));
  }
  if (Keyword === type && value === "function") {
    pushLocation(marker);
    next();
    if (options.scope) createScope();
    return parseFunctionDeclaration(null, null, true);
  }
  if (Keyword == type && value == "await") {
    if (scopeDepth == 1) {
      raise(token, "Unable to use await in a global scope!");
    }

    pushLocation(marker);
    next();

    var exp = parseExpression();
    return finishNode(b.awaitStatement(exp));
  }
  if (consume("{")) {
    pushLocation(marker);
    return parseTableConstructor();
  }
  if (token.value == "(") {
  }
}

// Parser
// ------

// Export the main parser.
//
//   - `wait` Hold parsing until end() is called. Defaults to false
//   - `scope` Track identifier scope. Defaults to false.
//   - `locations` Store location information. Defaults to false.
//   - `ranges` Store the start and end character locations. Defaults to
//     false.
//   - `onCreateNode` Callback which will be invoked when a syntax node is
//     created.
//   - `onCreateScope` Callback which will be invoked when a new scope is
//     created.
//   - `onDestroyScope` Callback which will be invoked when the current scope
//     is destroyed.

function parse(_input, _options) {
  if (typeof _options === "undefined" && typeof _input === "object") {
    _options = _input;
    _input = undefined;
  }
  if (!_options) _options = {};

  input = _input || "";
  options = extend(defaultOptions, _options);

  // Rewind the lexer
  length = input.length;
  // When tracking identifier scope, initialize with an empty scope.
  scopes = [[]];
  scopeDepth = 0;
  globals = [];
  locations = [];

  token = null;
  previousToken = null;
  lookahead = null;

  tokenIndex = 0;
  tokens = tokenizer.tokenize(input);

  isInClassMethod = false;
  isInClassConstructor = false;
  classConstructorToken = null;
  classContexts = [];

  currentClassParent = null;

  if (!options.wait) {
    const ast = end();

    ast.tokens = tokens;

    return ast;
  }

  return this;
}

// Write to the source code buffer without beginning the parse.

function write(_input) {
  input += String(_input);
  length = input.length;
  return this;
}

// Send an EOF and begin parsing.

function end(_input) {
  if (typeof _input !== "undefined") write(_input);

  // Ignore shebangs.

  if (input && input.substr(0, 2) === "#!") {
    input = input.replace(/^.*/, (line) => line.replace(/./g, " "));
  }

  length = input.length;
  trackLocations = options.locations || options.ranges;
  // Initialize with a lookahead token.
  lookahead = nextToken();

  const file = parseFile();
  if (options.scope) file.globals = globals;

  if (locations.length > 0)
    throw new Error(
      "Location tracking failed. This is most likely a bug in the parser",
    );

  return file;
}

/* vim: set sw=2 ts=2 et tw=79 : */

const parser = {
  version: "0.2.1",
  defaultOptions,
  errors,
  parse,
  write,
  end,
};

export default parser;
