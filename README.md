# NPM License Generator

Generate a page with a copy of NPM dependency licenses. [Example](https://mymindstorm.github.io/npm-license-generator/example_licenses)

How licenses are found:

1. Get package version and tarball location from package.lock
2. If there is a license file in the tarball, then extract and use that
3. Otherwise, evaluate SPDX string and use a file from https://github.com/spdx/license-list-data/tree/master/text

## Usage

- install
- options

## Use your own template
