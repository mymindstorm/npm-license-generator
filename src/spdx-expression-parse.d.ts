declare module 'spdx-expression-parse' {
    export default function parse(license: string): license | junction;
}

interface license {
    license: string;
}

interface junction {
    left: license | junction;
    conjunction: string;
    right: license | junction;
}
