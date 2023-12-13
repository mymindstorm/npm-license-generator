import process from "process";
import path from "path";
import fs from "fs";
import yargs from "yargs";
import mustache from "mustache";
import { DEFAULTS, retrieveAllLicenses } from "./licenses";

async function main(options: Options): Promise<void> {
  const { pkgInfo, licenses } = await retrieveAllLicenses(options);

  licenses.sort((a, b) => {
    if (a.pkg.name < b.pkg.name) {
      return -1;
    } else if (a.pkg.name > b.pkg.name) {
      return 1;
    } else {
      return 0;
    }
  });

  const groupedLicenses: GroupedLicense[] = [];
  if (!options.noGroup) {
    for (const license of licenses) {
      for (const i in license.text) {
        const text = license.text[i];
        if (text) {
          let found = false;
          for (const groupedLicense of groupedLicenses) {
            if (groupedLicense.text.includes(text)) {
              groupedLicense.pkgs.push({ ...license.pkg, comma: true });
              found = true;
            }
          }
          if (!found) {
            groupedLicenses.push({
              pkgs: [{ ...license.pkg, comma: true }],
              text,
            });
          }
        }
      }
    }

    for (const license of groupedLicenses) {
      for (const i in license.pkgs) {
        if (i === String(license.pkgs.length - 1)) {
          license.pkgs[i].comma = false;
        }
      }
    }
  }

  const renderLicenses = options.noGroup ? licenses : groupedLicenses;
  const outtext = mustache.render(
    fs.readFileSync(options.templatePath).toString(),
    {
      renderLicenses,
      name: pkgInfo.name,
    }
  );

  fs.writeFileSync(options.outPath, outtext);
  console.log("Done!");
}

yargs
  .scriptName("npm-license-generator")
  .command("$0 [folder]", "", (yargs) => {
    const argv = yargs
      .positional("folder", {
        describe:
          "Folder of NPM project. Defaults to current working directory",
        type: "string",
      })
      .option("out-path", {
        describe: "HTML output path",
        type: "string",
        default: DEFAULTS.outPath,
      })
      .option("registry", {
        describe: "URL of package registry to use",
        type: "string",
        default: DEFAULTS.registry,
      })
      .option("tmp-folder-name", {
        describe: "Name of temporary folder",
        type: "string",
        default: DEFAULTS.tmpFolderPath,
      })
      .option("template", {
        describe: "Path to custom mustache template",
        type: "string",
      })
      .option("no-group", {
        describe: "Do not group licenses",
        type: "boolean",
        default: DEFAULTS.noGroup,
      })
      .option("package-lock", {
        describe: "Run on all packages listed in package-lock.json",
        type: "boolean",
        default: DEFAULTS.runPkgLock,
      })
      .option("no-spdx", {
        describe: "Do not download license file based on SPDX string",
        type: "boolean",
        default: DEFAULTS.noSpdx,
      })
      .option("only-spdx", {
        describe: "Do not download tarballs, only use SPDX string",
        type: "boolean",
        default: DEFAULTS.onlySpdx,
      })
      .option("error-missing", {
        describe: "Exit 1 if no license is present for a package",
        type: "boolean",
        default: DEFAULTS.errMissing,
      }).argv;

    const folder = argv.folder || (argv._[0] as string);
    const cwd = folder ? path.resolve(folder) : process.cwd();
    const options: Options = {
      cwd,
      registry: argv.registry,
      tmpFolderPath: path.resolve(cwd, argv["tmp-folder-name"]),
      nodeModulesPath: path.resolve(cwd, "node_modules"),
      outPath: path.resolve(argv["out-path"]),
      noGroup: argv["no-group"],
      templatePath: argv.template
        ? path.resolve(argv.template)
        : path.join(
            __dirname,
            argv["no-group"] ? "template.html" : "template-grouped.html"
          ),
      runPkgLock: argv["package-lock"],
      noSpdx: argv["no-spdx"],
      onlySpdx: argv["only-spdx"],
      errMissing: argv["error-missing"],
    };
    main(options);
  })
  .help().argv;
