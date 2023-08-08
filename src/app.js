import chalk from "chalk";
import path from "path";
import commander from "commander";
import extend from "extend";
import jetpack from "fs-jetpack";

import Workspace from "./transpiler/workspace";
import FileHandler from "./transpiler/filehandler";

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

function getAbsolutePath(p) {
  if (p) {
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }
  return process.cwd();
}

commander
  .version(require("../package.json").version)
  .command("watch <dir> <out>")
  .description("watch specified directory for file changes and compile")
  .option("-r --release", "Signal that this is a release build")
  .option("-d, --debug")
  .option("-a, --ast", "Generate AST json file along with compiled code.")
  .option("-m, --min", "Minify compiled code.")
  .option("-o, --obfuscate", "Obfuscate compiled code.")
  .option("--indent <size>", "The size of one indent.", parseInt)
  .option(
    "--header",
    "Header template to place on the top of each compiled file.",
  )
  .action((dir, out, _options) => {
    const workspace = new Workspace(
      JSON.stringify(
        extend(defaultOptions, {
          debug: _options.debug,
          ast: _options.ast,
          minify: _options.minify,
          obfuscate: _options.obfuscate,
          header: _options.header,
          indent: _options.indent,
          path: {
            input: dir,
            output: out,
          },
          merges: [],
        }),
      ),
      _options.release,
    );
    FileHandler.create(workspace, true);
  });

commander
  .version(require("../package.json").version)
  .command("workspace [file]")
  .option("-r --release", "Signal that this is a release build")
  .option("-w --watch", "Watch the files for changes")
  .description(
    "use a specific json file as configuration. if no file is specified it tries to look at ./lauxconfig.json",
  )
  .action((file, _options) => {
    const absoluteFilePath = getAbsolutePath(file ?? "./lauxconfig.json");

    jetpack
      .readAsync(absoluteFilePath)
      .then((data) => {
        if (data === undefined) {
          console.log(
            `${chalk.magenta("LAUX")} ${chalk.red(
              "ERROR",
            )} Unable to find file '${file}'`,
          );

          return;
        }

        const workspace = new Workspace(data, _options.release);
        FileHandler.create(workspace, _options.watch);
      })
      .catch((e) => {
        console.log(
          `${chalk.magenta("LAUX")} ${chalk.red(
            "ERROR",
          )} Error happened while trying to find '${file}'. Error: ${e.stack}`,
        );
      });
  });

commander.on("*", () => {
  console.error(
    chalk.red(
      "Invalid command: %s\n\tSee --help for a list of available commands.",
    ),
    commander.args.join(" "),
  );
  process.exit(1);
});

// Parse the command line arguments
commander.parse(process.argv);

// Display help if no command is provided
if (process.argv.length < 3) {
  commander.outputHelp();
}
