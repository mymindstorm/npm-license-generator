import superagent from "superagent";
import process from "process";
import path from "path";
import fs from "fs";
import rimraf from "rimraf";
import yargs, { Argv } from "yargs";
import tar from "tar";
import mustache from "mustache";

let CWD = "";
let REGISTRY = "";
let PKG_JSON_PATH = "";
let PKG_LOCK_JSON_PATH = "";
let TMP_FOLDER_PATH = "";
let OUT_PATH = "";
let TEMPLATE_PATH = "";

yargs.scriptName("npm-license-generator")
  .command("$0 [folder] [args]", "", yargs => {
    const argv = yargs
      .positional("folder", { describe: "Folder of NPM project. Defaults to current working directory", type: "string" })
      .option("out-path", { describe: "HTML output path", type: "string", default: "./licenses.html" })
      .option("registry", { describe: "URL of package registry to use", type: "string", default: "https://registry.npmjs.org" })
      .option("tmp-folder-name", { describe: "Name of temporary folder", type: "string", default: ".license-gen-tmp" })
      .option("template", { describe: "Path to custom mustache template", type: "string" })
      .argv

    CWD = argv.folder ? path.resolve(argv.folder) : process.cwd();
    REGISTRY = argv.registry;
    PKG_JSON_PATH = path.resolve(CWD, 'package.json');
    PKG_LOCK_JSON_PATH = path.resolve(CWD, 'package-lock.json');
    TMP_FOLDER_PATH = path.resolve(CWD, argv["tmp-folder-name"]);
    OUT_PATH = path.resolve(argv["out-path"]);
    TEMPLATE_PATH = argv.template ? path.resolve(argv.template) : path.join(__dirname, "view", "template.html");
    main();
  })
  .help()
  .argv

async function main() {
  let pkgInfo: PkgJsonData | undefined;
  let pkgLockInfo: PkgLockJsonData | undefined;
  try {
    const pkgJson = fs.readFileSync(PKG_JSON_PATH, 'utf8');
    pkgInfo = JSON.parse(pkgJson);
    const pkgLockJson = fs.readFileSync(PKG_LOCK_JSON_PATH, 'utf8');
    pkgLockInfo = JSON.parse(pkgLockJson);
  } catch (e) {
    console.error("Error parsing package.json or package-lock.json", e);
    process.exit(1);
  }

  if (!pkgInfo) {
    console.error("pkgInfo undefined");
    process.exit(1);
  }

  let keys: string[] = [];
  if (pkgInfo.dependencies) {
    keys = keys.concat(Object.keys(pkgInfo.dependencies));
  }
  if (pkgInfo.devDependencies) {
    keys = keys.concat(Object.keys(pkgInfo.devDependencies));
  }
  if (pkgInfo.optionalDependencies) {
    keys = keys.concat(Object.keys(pkgInfo.optionalDependencies));
  }

  let pkgs: PkgInfo[] = [];
  for (const pkg of keys) {
      let info: PkgInfo = { name: pkg, version: "" }
      if (pkgLockInfo) {
        if (pkgLockInfo.dependencies && pkgLockInfo.dependencies[pkg]) {
          info.version = pkgLockInfo.dependencies[pkg].version
          info.tarball = pkgLockInfo.dependencies[pkg].resolved
        } else {
          console.warn(`Could not find ${pkg} in package-lock.json! Skipping...`);
          continue;
        }
      }
      pkgs.push(info);
  }

  if (!fs.existsSync(TMP_FOLDER_PATH)) {
    fs.mkdirSync(TMP_FOLDER_PATH);
  }
  const promises: Promise<LicenseInfo>[] = [];
  for (const pkg of pkgs) {
    promises.push(getPkgLicense(pkg));
  }

  let licenses = await Promise.all(promises);
  licenses.sort((a, b) => {
    if (a.pkg.name < b.pkg.name) {
      return -1;
    } else if (a.pkg.name > b.pkg.name) {
      return 1;
    } else {
      return 0;
    }
  });

  const outtext = mustache.render(fs.readFileSync(TEMPLATE_PATH).toString(), { licenses, name: pkgInfo.name })

  fs.writeFileSync(OUT_PATH, outtext);
  rimraf.sync(TMP_FOLDER_PATH);
  console.log("Done!")
}

async function getPkgLicense(pkg: PkgInfo): Promise<LicenseInfo> {
  // Get package info from registry
  let license: LicenseInfo = {
    pkg: pkg,
    type: "",
    text: []
  }
  const url = new URL(REGISTRY);
  url.pathname = pkg.name;
  // Get registry info
  await new Promise(resolve => {
    superagent.get(url.toString()).then(res => {
      license.type = res.body.license;
      license.pkg.homepage = res.body.homepage || res.body.repository.url
      if (!pkg.tarball) {
        try {
          pkg.tarball = res.body.versions[pkg.version].dist.tarball;
        } catch (e) {
          console.error(`Could not find version info for ${pkg.name} ${pkg.version}`);
          return license;
        }
      }
      resolve()
    }).catch(e => {
      console.warn(`Could not get info from registry for ${pkg.name}! HTTP status code ${e.status}`);
      return license;
    });
  });
  // Download tarball
  const fileName = `${pkg.name.replace("/", ".")}-${pkg.version}`;
  await new Promise(resolve => {
    if (!pkg.tarball) {
      console.error("No tarball location", pkg)
      return license;
    }
    superagent.get(pkg.tarball)
      .buffer(true)
      .parse(superagent.parse['application/octet-stream'])
      .then(res => {
        fs.writeFileSync(path.join(TMP_FOLDER_PATH, fileName + ".tgz"), res.body);
        resolve()
      });
  });

  // Extract license
  const extractFolder = path.join(TMP_FOLDER_PATH, fileName)
  if (!fs.existsSync(extractFolder)) {
    fs.mkdirSync(extractFolder);
  }
  await tar.extract({
    cwd: extractFolder,
    file: path.join(TMP_FOLDER_PATH, fileName + ".tgz"),
    // strip: 1,
    filter: (path) => {
      const regex = /(LICENSE|LICENCE|COPYING|COPYRIGHT).*/gim;
      if (regex.test(path)) {
        return true;
      }
      return false;
    }
  });

  // Throw license files into array
  let files = getAllFiles(extractFolder);
  for (const path of files) {
    license.text.push(fs.readFileSync(path).toString().trim());
  }
  return license;
}

function getAllFiles(dirPath: string, arrayOfFiles?: string[]) {
  const files = fs.readdirSync(dirPath)

  arrayOfFiles = arrayOfFiles || []

  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
    } else {
      arrayOfFiles?.push(path.join(dirPath, file))
    }
  })

  return arrayOfFiles
}
