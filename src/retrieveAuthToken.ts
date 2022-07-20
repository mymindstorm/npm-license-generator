// Code inspired from https://github.com/vanioinformatika/node-npmrc-auth-token-retriever

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function findAuthToken(
  content: string,
  registry = "registry.npmjs.org"
): string | null {
  const lines = content.split("\n").map((line) => line.trim());

  const authTokenLine = lines.find((line) =>
    new RegExp(`^//${registry}/:_authToken=`).test(line)
  );

  if (!authTokenLine) {
    return null;
  }

  return authTokenLine.substr(`//${registry}/:_authToken=`.length);
}

export function retrieveAuthToken(
  registry = "registry.npmjs.org",
  npmrcPath?: string
): string | null {
  npmrcPath = npmrcPath || path.join(os.homedir(), ".npmrc");

  if (!fs.existsSync(npmrcPath)) {
    return null;
  }

  const content = fs.readFileSync(npmrcPath, { encoding: "utf8" });

  return findAuthToken(content, registry);
}
