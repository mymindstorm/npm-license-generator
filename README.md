# NPM License Generator

Generate a page with a copy of NPM dependency licenses. [Example output](https://mymindstorm.github.io/npm-license-generator/example_licenses)

## Usage

Install:

```bash
npm install --global npm-license-generator
```

Options:

```bash
$ npm-license-generator --help

Usage:
  npm-license-generator [folder]

Positionals:
  folder  Folder of NPM project. Defaults to current working directory  [string]

Options:
  --version          Show version number                               [boolean]
  --help             Show help                                         [boolean]
  --out-path         HTML output path      [string] [default: "./licenses.html"]
  --registry         URL of package registry to use
                                [string] [default: "https://registry.npmjs.org"]
  --tmp-folder-name  Name of temporary folder
                                          [string] [default: ".license-gen-tmp"]
  --template         Path to custom mustache template                   [string]
  --auth             Enable registry authentication, please call `npm adduser` first.
                                                      [boolean] [default: false]
  --group            Group licenses, to disable it, use --no-spdx
                                                       [boolean] [default: true]
  --package-lock     Run on all packages listed in package-lock.json
                                                      [boolean] [default: false]
  --spdx             Download license file based on SPDX string, to disable it, use `--no-spdx`.
                                                       [boolean] [default: true]
  --only-spdx        Do not download tarballs, only use SPDX string
                                                      [boolean] [default: false]
  --error-missing    Exit 1 if no license is present for a package
                                                      [boolean] [default: false]
```

## Use your own template

Supply your own template using the `--template` option. Templates are written in [Mustache](https://mustache.github.io/). Your template does not have to be HTML, change the output file name using `--out-path`.

By default, Mustache is given two variables: 
  - `name`: the package name
  - `renderLicenses`: an array of [GroupedLicense](https://github.com/mymindstorm/npm-license-generator/blob/ce81d002cd22320076e029ed2a612d4e6ad9dacf/src/types.d.ts#L45-L53). When using `--no-group`, an array of [LicenseInfo](https://github.com/mymindstorm/npm-license-generator/blob/ce81d002cd22320076e029ed2a612d4e6ad9dacf/src/types.d.ts#L32-L43) is passed instead. 
  
  Check the [lib](https://github.com/mymindstorm/npm-license-generator/tree/master/lib) folder for example templates.

## How licenses are found

1. Get package version and tarball location from package.lock
2. Look for licenses in node_modules if avalible
3. Otherwise download tarball, extract, look for licenses, and use that
4. Otherwise, evaluate SPDX string and use a file from https://github.com/spdx/license-list-data/tree/master/text
