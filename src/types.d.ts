interface PkgJsonData {
  name: string;
  version: string;
  homepage?: string;
  license?: string;
  repository?:
    | {
        type: string;
        url: string;
      }
    | string;
  dependencies?: {
    [key: string]: string;
  };
  devDependencies?: {
    [key: string]: string;
  };
  optionalDependencies?: {
    [key: string]: string;
  };
}

interface PkgLockJsonDataV1 {
  lockfileVersion: number;
  dependencies: {
    [name: string]: {
      version: string;
      resolved: string;
    };
  };
}

interface PkgLockJsonData {
  lockfileVersion: number;
  packages: {
    [name: string]: {
      version: string;
      resolved: string;
    };
  };
}

interface PkgInfo {
  name: string;
  version: string;
  tarball?: string;
  homepage?: string;
}

interface LicenseInfo {
  pkg: PkgInfo;
  type: string;
  text: string[];
}

interface GroupedLicensePkg extends PkgInfo {
  // false if last item in group
  comma: boolean;
}

interface GroupedLicense {
  pkgs: GroupedLicensePkg[];
  text: string;
}
