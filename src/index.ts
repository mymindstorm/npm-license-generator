import superagent from "superagent";
import process from "process";
import path from "path";
import fs from "fs";
import tar from "tar";
import mustache from "mustache";

const REGISTRY = "https://registry.npmjs.org";
const PKG_JSON_PATH = path.resolve(process.cwd(), 'package.json');
const PKG_LOCK_JSON_PATH = path.resolve(process.cwd(), 'package-lock.json');
const TMP_FOLDER_PATH = path.resolve(process.cwd(), '.license-gen-tmp');
const OUT_PATH = path.resolve(process.cwd(), 'licenses.html');

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
    try {
      let info: PkgInfo = { name: pkg, version: "" }
      if (pkgLockInfo) {
        if (pkgLockInfo.dependencies && pkgLockInfo.dependencies[pkg]) {
          info.version = pkgLockInfo.dependencies[pkg].version
          info.tarball = pkgLockInfo.dependencies[pkg].resolved
        }
      }
      pkgs.push(info);
    } catch (e) {
      console.warn(`Could not find ${pkg} in package-lock.json! Skipping...`);
    }
  }

  if (!fs.existsSync(TMP_FOLDER_PATH)) {
    fs.mkdirSync(TMP_FOLDER_PATH);
  }
  const promises: Promise<LicenseInfo>[] = [];
  for (const pkg of pkgs) {
    promises.push(getPkgLicense(pkg));
  }
  // TODO: dedupe and group
  // TODO: handle empty license text
  // TODO: add project name
  // TODO: add project url
  const licenses = await Promise.all(promises);
  const outtext = mustache.render(fs.readFileSync(path.join(__dirname, "template.html")).toString(), { licenses })

  fs.writeFileSync(OUT_PATH, outtext)
  fs.rmdirSync(TMP_FOLDER_PATH, { recursive: true });
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
  // Get registry info if not in lockfile
  await new Promise(resolve => {
    superagent.get(url.toString()).then(res => {
      license.type = res.body.license;
      if (!pkg.tarball) {
        try {
          pkg.tarball = res.body.versions[pkg.version].dist.tarball;
        } catch (e) {
          console.error(`Could not find version info for ${pkg.name} ${pkg.version}`);
          return license;
        }
      }
      resolve()
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

main()
