declare module "spdx-expression-parse" {
  export default function parse(license: string): SPDXLicense | SPDXJunction;
}

interface SPDXLicense {
  license: string;
}

interface SPDXJunction {
  left: SPDXLicense | SPDXJunction;
  conjunction: string;
  right: SPDXLicense | SPDXJunction;
}
