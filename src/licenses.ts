import superagent from "superagent";
import { URL } from "url";
import path from "path";
import fs from "fs";
import { rimraf } from "rimraf";
import { extract } from "tar";
import spdx from "spdx-expression-parse";

export const DEFAULTS: Options = {
  cwd: "",
  registry: "https://registry.npmjs.org",
  nodeModulesPath: "",
  tmpFolderPath: ".license-gen-tmp",
  outPath: "./licenses.html",
  templatePath: "",
  noGroup: false,
  runPkgLock: false,
  noSpdx: false,
  onlySpdx: false,
  errMissing: false,
};

const NO_MATCH_EXTENSIONS = [
  "js",
  "ts",
  "d.ts",
  "c",
  "cpp",
  "h",
  "class",
  "pl",
  "sh",
];

function getAllFiles(dirPath: string, arrayOfFiles?: string[]): string[] {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
    } else {
      arrayOfFiles?.push(path.join(dirPath, file));
    }
  });

  return arrayOfFiles;
}

async function getPkgLicense(
  options: Options,
  pkg: PkgInfo,
): Promise<LicenseInfo> {
  // Get package info from registry
  const license: LicenseInfo = {
    pkg: pkg,
    type: "",
    text: [],
  };
  const url = new URL(options.registry);
  url.pathname = pkg.name;
  // Get registry info
  await new Promise<void>((resolve) => {
    superagent
      .get(url.toString())
      .then((res) => {
        license.type = res.body.license;
        if (!res.body.license) {
          try {
            license.type = res.body.versions[pkg.version].license;
          } catch {
            console.error(
              `Could not find license info in registry for ${pkg.name} ${pkg.version}`,
            );
            return license;
          }
        }
        license.pkg.homepage = res.body.homepage || res.body.repository?.url;
        if (!pkg.tarball) {
          try {
            pkg.tarball = res.body.versions[pkg.version].dist.tarball;
          } catch {
            console.error(
              `Could not find version info for ${pkg.name} ${pkg.version}`,
            );
            return license;
          }
        }
        resolve();
      })
      .catch((e) => {
        if (e?.status) {
          console.warn(
            `Could not get info from registry for ${pkg.name}! HTTP status code ${e.status}`,
          );
        } else {
          console.warn(
            `Could not get info from registry for ${pkg.name}! Error: ${e}`,
          );
        }
        return license;
      });
  });

  // look for license in node_modules
  if (!options.onlySpdx) {
    try {
      let files = getAllFiles(path.join(options.nodeModulesPath, pkg.name));
      files = files.filter((path) => {
        const regex = /[/\\](LICENSE|LICENCE|COPYING|COPYRIGHT)\.?.*/gim;
        const extension = path.split(".");
        if (NO_MATCH_EXTENSIONS.includes(extension[extension.length - 1])) {
          return false;
        }
        if (regex.test(path)) {
          return true;
        }
        return false;
      });
      for (const path of files) {
        license.text.push(fs.readFileSync(path).toString().trim());
      }
    } catch {
      /* empty */
    }
  }

  // Download tarball if not found locally
  const fileName = `${pkg.name.replace("/", ".")}-${pkg.version}`;
  if (!options.onlySpdx && !license.text.length) {
    await new Promise<void>((resolve) => {
      if (!pkg.tarball) {
        console.error("No tarball location", pkg);
        return license;
      }
      superagent
        .get(pkg.tarball)
        .buffer(true)
        .parse(superagent.parse["application/octet-stream"])
        .then((res) => {
          fs.writeFileSync(
            path.join(options.tmpFolderPath, fileName + ".tgz"),
            res.body,
          );
          resolve();
        });
    });

    // Extract license
    const extractFolder = path.join(options.tmpFolderPath, fileName);
    if (!fs.existsSync(extractFolder)) {
      fs.mkdirSync(extractFolder);
    }
    await extract({
      cwd: extractFolder,
      file: path.join(options.tmpFolderPath, fileName + ".tgz"),
      // strip: 1,
      filter: (path) => {
        const regex = /[/\\](LICENSE|LICENCE|COPYING|COPYRIGHT)\.?.*/gim;
        const extension = path.split(".");
        if (NO_MATCH_EXTENSIONS.includes(extension[extension.length - 1])) {
          return false;
        }
        if (regex.test(path)) {
          return true;
        }
        return false;
      },
    });

    // Throw license files into array
    const files = getAllFiles(extractFolder);
    for (const path of files) {
      license.text.push(fs.readFileSync(path).toString().trim());
    }
  }

  if (!license.text.length) {
    if (!options.onlySpdx) {
      console.warn(
        `No license file found for package ${license.pkg.name}${
          options.noSpdx ? "" : ", using SPDX string"
        }.`,
      );
    }

    if (!options.noSpdx) {
      // eslint-disable-next-line no-async-promise-executor
      await new Promise<void>(async (resolve) => {
        let parsedLicense: SPDXLicense | SPDXJunction | undefined;
        try {
          parsedLicense = spdx(license.type);
        } catch {
          console.error(
            `Error: Could not parse license string '${license.type}' for ${license.pkg.name}!`,
          );
          resolve();
          return;
        }
        if (!parsedLicense) {
          resolve();
          return;
        }
        const licenseStrings: string[] = [];
        if ("license" in parsedLicense) {
          licenseStrings.push(parsedLicense.license);
        } else {
          const getLicenses = (license: SPDXJunction): void => {
            if ("license" in license.left) {
              licenseStrings.push(license.left.license);
            } else {
              getLicenses(license.left);
            }

            if ("license" in license.right) {
              licenseStrings.push(license.right.license);
            } else {
              getLicenses(license.right);
            }
          };
          getLicenses(parsedLicense);
        }

        for (const licenseString of licenseStrings) {
          await new Promise<void>((resolve) => {
            superagent
              .get(
                `https://raw.githubusercontent.com/spdx/license-list-data/master/text/${licenseString}.txt`,
              )
              .then((res) => {
                license.text.push(res.text);
                resolve();
              })
              .catch((e) => {
                console.warn(
                  `Error downloading license for ${license.pkg.name}. L: ${licenseString} S: ${e.status}`,
                );
                resolve();
              });
          });
        }
        resolve();
      });
    }

    if (!license.text.length) {
      if (options.errMissing) {
        process.exit(1);
      } else {
        console.error(`No license file for ${license.pkg.name}, skipping...`);
      }
    }
  }

  return license;
}

export async function retrieveAllLicenses(
  argOptions = {},
): Promise<AllPkgsInfo> {
  const options = Object.assign(structuredClone(DEFAULTS), argOptions);

  let pkgInfo: PkgJsonData | undefined;
  let pkgLockDependencies: PkgLockDependencies | undefined;
  try {
    const pkgJsonPath = path.resolve(options.cwd, "package.json");
    const pkgJson = fs.readFileSync(pkgJsonPath, "utf8");
    pkgInfo = JSON.parse(pkgJson);
    const pkgLockJsonPath = path.resolve(options.cwd, "package-lock.json");
    const pkgLockJson = fs.readFileSync(pkgLockJsonPath, "utf8");
    const pkgLockInfo: PkgLockJsonData = JSON.parse(pkgLockJson);
    pkgLockDependencies = pkgLockInfo?.dependencies ?? pkgLockInfo?.packages;
  } catch (e) {
    console.error("Error parsing package.json or package-lock.json", e);
    process.exit(1);
  }

  if (!pkgInfo) {
    console.error("pkgInfo undefined");
    process.exit(1);
  }

  let keys: string[] = [];
  if (!options.runPkgLock) {
    if (pkgInfo.dependencies) {
      keys = keys.concat(Object.keys(pkgInfo.dependencies));
    }
    if (pkgInfo.devDependencies) {
      keys = keys.concat(Object.keys(pkgInfo.devDependencies));
    }
    if (pkgInfo.optionalDependencies) {
      keys = keys.concat(Object.keys(pkgInfo.optionalDependencies));
    }
  } else {
    if (pkgLockDependencies) {
      keys = Object.keys(pkgLockDependencies);
    }
  }

  const pkgs: PkgInfo[] = [];
  for (const pkg of keys) {
    const info: PkgInfo = { name: pkg, version: "" };
    if (pkgLockDependencies) {
      const dependency =
        pkgLockDependencies?.[pkg] ??
        pkgLockDependencies?.["node_modules/" + pkg];
      if (dependency) {
        info.version = dependency.version;
        info.tarball = dependency.resolved;
      } else {
        console.warn(`Could not find ${pkg} in package-lock.json! Skipping...`);
        continue;
      }
    }
    pkgs.push(info);
  }

  if (!fs.existsSync(options.tmpFolderPath)) {
    fs.mkdirSync(options.tmpFolderPath);
  }

  const promises: Promise<LicenseInfo>[] = [];
  for (const pkg of pkgs) {
    promises.push(getPkgLicense(options, pkg));
  }

  const licenses = await Promise.all(promises);

  await rimraf(options.tmpFolderPath);

  return {
    pkgInfo,
    licenses,
  };
}
