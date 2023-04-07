import chalk from 'chalk';
import walk from 'walk';
import path from 'path';
import commander from 'commander';
import chokidar from 'chokidar';
import extend from 'extend';
import bluebird from 'bluebird';

import jetpack from 'fs-jetpack';

// TODO: Either implement or completly remove from project
// import luamin from 'luamin';
// import luabeauty from './luabeauty';
// import luaobf from './luaobf';

import parser from './parser';
import highlighter from './highlighter';
import compiler from './compiler';
import CodeGenerator from './codegenerator';
import Workspace from './transpiler/workspace';
import FileHandler from './transpiler/filehandler';

const mkdirp = require('mkdirp-then');
require('any-promise/register/bluebird');

/**
  The default options object, with debug, ast, minify, obfuscate, and indent keys.
  @type {Object}
*/
const defaultOptions = {
  debug: false,
  ast: false,
  minify: false,
  obfuscate: false,
  indent: 4,
};

let fileHandler;

/**
  Prefixes the given code with a header, which includes the given text.
  @param {string} code - The Lua code to prefix.
  @param {string} [text='This code was generated by LAUX, a Lua transpiler\nLAUX is a fork of LAU with additional changes.\n\nMore info & source code can be found at: https://github.com/8char/laux-compiler'] - The text to include in the header.
  @returns {string} The code with the header prefixed.
*/
function prefixHeader(code, text) {
  if (text === undefined) {
    text = 'This code was generated by LAUX, a Lua transpiler\nLAUX is a fork of LAU with additional changes.\n\nMore info & source code can be found at: https://github.com/8char/laux-compiler';
  }

  var str = '';

  str += '--[[\n';
  str += text;
  str += '\n]]\n\n';

  str += code;
  return str;
}

/**
  Compiles the file with the given path, located under the given root directory,
  and writes the resulting Lua code to the output directory.
  @param {string} root - The root directory.
  @param {string} file - The file path.
  @param {string} out - The output directory.
  @returns {undefined}
*/

function compileFile(root, file, out) {
  const compiledPath = path.join(out, file);
  const compiledPathNoExt = compiledPath.slice(0, -path.extname(compiledPath).length);

  let elapsed = 0;

  const compilePromise = jetpack.readAsync(path.join(root, file))
    .then((data) => {
      const newData = data.replace(/\t/g, '  ');
      try {
        const timeStart = process.hrtime();
        const compiled = compileCode(newData);

        elapsed = process.hrtime(timeStart)[1] / 100000;

        return compiled;
      } catch (e) {
        if (e instanceof SyntaxError) {
          var lines = newData.split(/\r?\n/);

          var lineStart = Math.max(0, e.line - 3);
          var lineEnd = Math.min(lines.length, e.line + 3);

          console.log(chalk.magenta('LAUX') + ' ' +
            chalk.red('ERROR') + ' ' + `SyntaxError: ${file}: ${e.message}`);

          for (var i = lineStart; i < lineEnd; i++) {
            var line = lines[i];

            var c1 = i + 1 == e.line ? '>' : ' ';
            var lineFillStr = new Array((lineEnd.toString().length - (i + 1).toString().length) + 1).join(' ');
            var lineStr = lineFillStr + (i + 1).toString();
            var litLine = highlighter.highlight(line);
            console.log(chalk.red(c1) + chalk.gray(` ${lineStr} | `) + litLine);

            if (i + 1 == e.line) {
              var offset = new Array(e.column + 1).join(' ');
              console.log(' ' + chalk.gray(new Array(lineStr.length + 2).join(' ') + ` | `) + chalk.red(offset + '^'));
            }
          }

          console.log(e.stack);
        }
        else {
          console.log(chalk.magenta('LAUX') + ' ' +
            chalk.red('ERROR') + ` ${file}:`);

          console.log(chalk.magenta('LAUX') + ' ' +
            chalk.red('ERROR') + ` ${e.stack}`);
        }
      }
    });

  bluebird.join(
    compilePromise,
    mkdirp(path.dirname(compiledPathNoExt + '.lua'))
  ).spread((compiled) => {
    if (!compiled) return;

    if (options.ast) {
      jetpack.writeAsync(compiledPathNoExt + '.ast.json', JSON.stringify(compiled.ast, null, 2));
      jetpack.writeAsync(compiledPathNoExt + '.ast_compiled.json', JSON.stringify(compiled.compiledAST, null, 2));
    }

    var code;
    /*
    if (options.obfuscate)
      code = luaobf.obfuscate(compiled.compiledAST);
    else if (options.minify)
      code = luamin.minify(compiled.compiledAST);
    else
      code = luabeauty.beautify(compiled.compiledAST, {
        indent: options.indent
      });
    */

    var result = new CodeGenerator(compiled.code, compiled.compiledAST)
      .generate();

    code = result.code;

    jetpack
      .writeAsync(compiledPathNoExt + '.lua', prefixHeader(code, headerData))
      .then(() => {
      var roundedElapsed = Math.round(elapsed * 1000.0) / 1000.0;

      console.log(chalk.magenta('LAUX') + ' ' +
        chalk.magenta('BUILT') + ' ' + file + ' ' + chalk.green(roundedElapsed + 'ms'));
    }).catch((e) => {
      console.log('err', e);
    });
  }).catch((e) => {
    console.log(e);
  });
}

function compileCode(code) {
  const ast = parser.parse(code, {
    comments: true,
    locations: true,
    ranges: true,
  });

  const compiledAST = compiler.compile(
    JSON.parse(JSON.stringify(ast)),
    {
      debug: options.debug
    });

  return new CompiledFile(code, ast, compiledAST);
}

function compileFolder(root) {
  var outPath = path.join(root, options.out);

  var walker = walk.walk(root);
  walker.on('file', function (rootPath, fileStats, next) {
    var ext = path.extname(fileStats.name);
    if (ext == '.laux') {
      var p = path.join(rootPath, fileStats.name);
      var relative = path.relative(root, p);
      compileFile(root, relative, outPath);
    }

    next();
  });
}

function handleFileEvent(event, root, file, out) {
  let fileExtension = file.split('.').pop();

  if (fileExtension == 'laux') {
    return compileFile(root, file, out);
  } else if (fileExtension == 'lua') {
    var inPath = path.join(root, file);
    var inPathNoExt = inPath.slice(0, -path.extname(inPath).length);

    jetpack
      .copyAsync(inPathNoExt + '.lua', path.join(out, file), {
        overwrite: true
      })
      .then(() => {
      console.log(chalk.magenta('LAUX') + ' ' +
        chalk.cyan('COPIED') + ' ' + file);
    }).catch((e) => {
      console.log('err', e);
    });
  }
}

function watchFolder(root, out, workspace) {
  var watcher = chokidar.watch(path.join(root, '**/*.{lua,laux}'));

  watcher.on('add', filePath => {
    var relativePath = path.relative(root, filePath)
    console.log(chalk.magenta('LAUX') + ' ' + chalk.green('ADD') + ' ' + chalk.yellow(relativePath));
    handleFileEvent('add', root, relativePath, out);
  });

  watcher.on('change', filePath => {
    var relativePath = path.relative(root, filePath)
    console.log(chalk.magenta('LAUX') + ' ' + chalk.cyan('CHANGE') + ' ' + chalk.yellow(relativePath));
    handleFileEvent('change', root, relativePath, out);
  });

  watcher.on('unlink', filePath => {
    var relativePath = path.relative(root, filePath);
    var compiledPath = path.join(out, relativePath);
    var compiledPathNoExt = compiledPath.slice(0, -path.extname(compiledPath).length);

    console.log(chalk.magenta('LAUX') + ' ' + chalk.red('REMOVE') + ' ' + chalk.yellow(relativePath));
    jetpack.removeAsync(compiledPathNoExt + '.lua');
  });

  watcher.on('error', (error) => {
  });
}

function unlinkOutput(root) {

}

var args = process.argv;

function getAbsolutePath(p) {
  if (p) {
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }
  return process.cwd();
}

// TODO: Decide what to do with this one...
// function startWatching(dir, out, workspace) {
//   var root = getAbsolutePath(dir);
//   var outDir = getAbsolutePath(out);

//   if (!options.indent) {
//     console.log(chalk.magenta('LAUX') + ' ' +
//       chalk.red('ERROR') + ` Invalid indent size: '${_options.indent}'`);

//     return;
//   }


//   if (options.header) {
//     jetpack.readAsync(path.join(dir, '/header.txt')).then((data) => {
//       if (!data) {
//         console.log(chalk.magenta('LAUX') + ' ' +
//           chalk.red('ERROR') + ` Error reading header file: '${options.header}' not found.`);

//         return;
//       }

//       headerData = data.replace(/(^[\r\n]+)|([\r\n]+$)/g, '');
//       headerData = headerData.replace(/%date%/g, new Date().toUTCString());

//       watchFolder(root, outDir);
//     }).catch((e) => {
//       console.log(chalk.magenta('LAUX') + ' ' +
//         chalk.red('ERROR') + ' Error reading header file:' + e.stack);
//     });
//   } else {
//     watchFolder(root, outDir);
//   }
// }

commander
  .version('1.1.0')
  .command('watch <dir> <out>')
  .description('watch specified directory for file changes and compile')
  .option('-r --release', 'Signal that this is a release build')
  .option('-d, --debug')
  .option('-a, --ast', 'Generate AST json file along with compiled code.')
  .option('-m, --min', 'Minify compiled code.')
  .option('-o, --obfuscate', 'Obfuscate compiled code.')
  .option('--indent <size>', 'The size of one indent.', parseInt)
  .option('--header', 'Header template to place on the top of each compiled file.')
  .action((dir, out, _options) => {
    const workspace = new Workspace(JSON.stringify(extend(defaultOptions, {
      debug: _options.debug,
      ast: _options.ast,
      minify: _options.minify,
      obfuscate: _options.obfuscate,
      header: _options.header,
      indent: _options.indent,
      path: {
        input: dir,
        output: out
      },
      merges: []
    })), _options.release);
    fileHandler = new FileHandler(workspace);
  });

commander
  .version('1.1.0')
  .command('workspace [file]')
  .option('-r --release', 'Signal that this is a release build')
  .description('use a specific json file as configuration. if no file is specified it tries to look at ./lauxconfig.json')
  .action((file, _options) => {
    if (file === undefined) {
      file = getAbsolutePath('./lauxconfig.json')
    } else {
      file = getAbsolutePath(file);
    }

    jetpack.readAsync(file)
      .then(data => {
        if (data === undefined) {
          console.log(chalk.magenta('LAUX') + ' ' +
            chalk.red('ERROR') + ` Unable to find file '${file}'`);

          return;
        }

        const workspace = new Workspace(data, _options.release);
        fileHandler = new FileHandler(workspace);
      })
      .catch(e => {
        console.log(chalk.magenta('LAUX') + ' ' +
          chalk.red('ERROR') + ` Error happened while trying to find '${file}'. Error: ${e.stack}`);
      })
  })

commander.parse(process.argv);