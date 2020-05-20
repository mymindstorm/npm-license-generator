interface PkgJsonData {
  name: string,
  version: string,
  homepage?: string,
  license?: string,
  repository?: {
    type: string,
    url: string
  } | string
  dependencies?: {
    [key: string]: string
  },
  devDependencies?: {
    [key: string]: string
  },
  optionalDependencies?: {
    [key: string]: string
  }
}

interface PkgLockJsonData {
  dependencies: {
    [name: string]: {
      version: string
      resolved: string
    }
  }
}

interface PkgInfo {
  name: string,
  version: string,
  tarball?: string
  homepage?: string
}

interface LicenseInfo {
  pkg: PkgInfo,
  type: string,
  text: string[]
}
