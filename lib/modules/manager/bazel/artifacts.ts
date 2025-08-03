import is from '@sindresorhus/is';
import { logger } from '../../../logger';
import * as packageCache from '../../../util/cache/package';
import { readLocalFile } from '../../../util/fs';
import { hashStream } from '../../../util/hash';
import { Http } from '../../../util/http';
import { map as pMap } from '../../../util/promises';
import { regEx } from '../../../util/regex';
import type { UpdateArtifact, UpdateArtifactsResult, Upgrade } from '../types';
import { findCodeFragment, patchCodeAtFragments, updateCode } from './common';
import type { RecordFragment, StringFragment } from './types';

const http = new Http('bazel');

function getUrlFragments(rule: RecordFragment): StringFragment[] {
  const urls: StringFragment[] = [];

  const urlRecord = rule.children.url;
  if (urlRecord?.type === 'string') {
    urls.push(urlRecord);
  }

  const urlsRecord = rule.children.urls;
  if (urlsRecord?.type === 'array') {
    for (const urlRecord of urlsRecord.children) {
      if (urlRecord.type === 'string') {
        urls.push(urlRecord);
      }
    }
  }

  return urls;
}

function getPatchFragments(rule: RecordFragment): StringFragment[] {
  const patches: StringFragment[] = [];

  const patchesRecord = rule.children.patches;
  if (patchesRecord?.type === 'array') {
    for (const patchRecord of patchesRecord.children) {
      if (patchRecord.type === 'string') {
        patches.push(patchRecord);
      }
    }
  }

  return patches;
}

async function validatePatchFile(patchPath: string): Promise<boolean> {
  try {
    // Add ./ prefix for relative Bazel paths if needed
    const filePath = patchPath.startsWith('//:')
      ? `./${patchPath}`
      : patchPath.startsWith('//')
        ? `.${patchPath}`
        : patchPath;
    const patchBuffer = await readLocalFile(filePath);
    if (!patchBuffer) {
      logger.debug(`Patch file not found: ${patchPath}`);
      return false;
    }

    const patchContent = patchBuffer.toString('utf8');

    // Basic patch file validation - check if it looks like a patch
    const hasMinusLines = patchContent.includes('\n-');
    const hasPlusLines = patchContent.includes('\n+');
    const hasAtAtLines = /^@@.+@@/m.test(patchContent);

    if (!hasAtAtLines || (!hasMinusLines && !hasPlusLines)) {
      logger.debug(`File does not appear to be a valid patch: ${patchPath}`);
      return false;
    }

    logger.debug(`Validated patch file: ${patchPath}`);
    return true;
  } catch (error) {
    logger.debug({ error, patchPath }, 'Error validating patch file');
    return false;
  }
}

async function validatePatches(
  patchFragments: StringFragment[],
): Promise<boolean> {
  if (!patchFragments.length) {
    return true; // No patches to validate
  }

  const validationResults = await pMap(patchFragments, (patch) =>
    validatePatchFile(patch.value),
  );

  const validPatches = validationResults.filter(Boolean).length;
  const totalPatches = patchFragments.length;

  if (validPatches === 0) {
    logger.warn(`No valid patch files found out of ${totalPatches} patches`);
    return false;
  }

  if (validPatches < totalPatches) {
    logger.debug(
      `Only ${validPatches} out of ${totalPatches} patch files are valid`,
    );
  }

  return true;
}

const urlMassages = {
  'bazel-skylib.': 'bazel_skylib-',
  '/bazel-gazelle/releases/download/0': '/bazel-gazelle/releases/download/v0',
  '/bazel-gazelle-0': '/bazel-gazelle-v0',
  '/rules_go/releases/download/0': '/rules_go/releases/download/v0',
  '/rules_go-0': '/rules_go-v0',
};

function massageUrl(url: string): string {
  let result = url;
  for (const [from, to] of Object.entries(urlMassages)) {
    result = result.replace(from, to);
  }
  return result;
}

function migrateUrl(url: string, upgrade: Upgrade): string {
  const newValue = upgrade.newValue?.replace(regEx(/^v/), '');

  // @see https://github.com/bazelbuild/rules_webtesting/releases/tag/0.3.5
  // @see https://github.com/bazelbuild/rules_webtesting/releases/tag/0.4.0
  if (
    url.endsWith('/rules_webtesting.tar.gz') &&
    !newValue?.match(regEx(/^0\.[0123]\./))
  ) {
    return url.replace(regEx(/\.tar\.gz$/), `-${newValue}.tar.gz`);
  }

  return url;
}

function replaceAll(input: string, from: string, to: string): string {
  return input.split(from).join(to);
}

function replaceValues(
  content: string,
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  // istanbul ignore if
  if (!from || !to || from === to) {
    return content;
  }
  const massagedFrom = from.replace(regEx(/^v/), '');
  const massagedTo = to.replace(regEx(/^v/), '');
  return replaceAll(content, massagedFrom, massagedTo);
}

async function getHashFromUrl(url: string): Promise<string | null> {
  const cacheNamespace = 'url-sha256';
  const cachedResult = await packageCache.get<string | null>(
    cacheNamespace,
    url,
  );
  /* istanbul ignore next line */
  if (cachedResult) {
    return cachedResult;
  }
  try {
    const hash = await hashStream(http.stream(url), 'sha256');
    const cacheMinutes = 3 * 24 * 60; // 3 days
    await packageCache.set(cacheNamespace, url, hash, cacheMinutes);
    return hash;
  } catch /* istanbul ignore next */ {
    return null;
  }
}

async function getHashFromUrls(urls: string[]): Promise<string | null> {
  const hashes = (
    await pMap(urls, (url) => getHashFromUrl(massageUrl(url)))
  ).filter(is.truthy);
  if (!hashes.length) {
    logger.debug({ urls }, 'Could not calculate hash for URLs');
    return null;
  }

  const distinctHashes = new Set(hashes);
  // istanbul ignore if
  if (distinctHashes.size > 1) {
    logger.warn({ urls }, 'Found multiple hashes for single def');
  }

  return hashes[0];
}

export function convertBazelPatchPathToFilePath(path: string): string {
  if (path.startsWith('//:') || path.startsWith('//')) {
    return path.replace('//:', '').replace('//', '');
  }
  return path;
}

async function getPatchContent(path: string): Promise<string | undefined> {
  // Add ./ prefix for relative Bazel paths if needed
  const filePath = path.startsWith('//:')
    ? `./${path}`
    : path.startsWith('//')
      ? `.${path}`
      : path;
  const localPathContent = await readLocalFile(filePath);
  return localPathContent?.toString('utf8');
}

async function updatePatchPackageVersion(
  patch: string,
  upgrade: Upgrade,
): Promise<string | null> {
  const patchContent = await getPatchContent(patch);
  if (!patchContent) {
    return null;
  }

  // Look for package_version lines in patch content that need updating
  // Match lines that contain + followed by package_version = "version"
  const packageVersionRegex = /^(\s*\+.*package_version\s*=\s*")([^"]+)(".*)/gm;
  let updatedContent = patchContent;
  let hasChanges = false;

  if (upgrade.currentValue && upgrade.newValue) {
    updatedContent = updatedContent.replace(
      packageVersionRegex,
      (match, prefix, version, suffix) => {
        if (version === upgrade.currentValue) {
          hasChanges = true;
          return prefix + upgrade.newValue + suffix;
        }
        return match;
      },
    );
  } else if (upgrade.currentVersion && upgrade.newVersion) {
    updatedContent = updatedContent.replace(
      packageVersionRegex,
      (match, prefix, version, suffix) => {
        if (version === upgrade.currentVersion) {
          hasChanges = true;
          return prefix + upgrade.newVersion + suffix;
        }
        return match;
      },
    );
  }

  return hasChanges ? updatedContent : null;
}

export async function updateArtifacts(
  updateArtifact: UpdateArtifact,
): Promise<UpdateArtifactsResult[] | null> {
  const { packageFileName: path, updatedDeps: upgrades } = updateArtifact;
  const oldContents = updateArtifact.newPackageFileContent;
  let newContents = oldContents;
  const artifactFiles: UpdateArtifactsResult[] = [];

  for (const upgrade of upgrades) {
    const { managerData } = upgrade;
    const idx = managerData?.idx as number;

    if (upgrade.depType === 'http_file' || upgrade.depType === 'http_archive') {
      const rule = findCodeFragment(newContents, [idx]);
      /* v8 ignore start -- used only for type narrowing */
      if (rule?.type !== 'record') {
        continue;
      } /* v8 ignore stop */

      const urlFragments = getUrlFragments(rule);
      if (!urlFragments?.length) {
        logger.debug(`def: ${rule.value}, urls is empty`);
        continue;
      }

      // Check and validate patches if they exist
      const patchFragments = getPatchFragments(rule);
      if (patchFragments.length > 0) {
        const patchesValid = await validatePatches(patchFragments);
        if (!patchesValid) {
          logger.debug(`Skipping update due to invalid patches`);
          continue;
        }
        logger.debug(
          `Found and validated ${patchFragments.length} patch files`,
        );

        // Update patch files with new package versions
        const patchesFragment = rule.children.patches;
        if (patchesFragment?.type === 'array') {
          for (const patch of patchesFragment.children) {
            if (patch.type === 'string') {
              const updatedPatchContent = await updatePatchPackageVersion(
                patch.value,
                upgrade,
              );
              if (updatedPatchContent) {
                const patchPath = convertBazelPatchPathToFilePath(patch.value);
                logger.debug(`Updating patch file: ${patchPath}`);

                artifactFiles.push({
                  file: {
                    type: 'addition',
                    path: patchPath,
                    contents: updatedPatchContent,
                  },
                });
              }
            }
          }
        }
      }

      const updateValues = (oldUrl: string): string => {
        let url = oldUrl;
        url = replaceValues(url, upgrade.currentValue, upgrade.newValue);
        url = replaceValues(url, upgrade.currentDigest, upgrade.newDigest);
        url = migrateUrl(url, upgrade);
        return url;
      };

      const urls = urlFragments.map(({ value }) => updateValues(value));
      const hash = await getHashFromUrls(urls);
      if (!hash) {
        continue;
      }

      newContents = patchCodeAtFragments(
        newContents,
        urlFragments,
        updateValues,
      );
      newContents = updateCode(
        newContents,
        [idx, 'strip_prefix'],
        updateValues,
      );

      newContents = updateCode(newContents, [idx, 'sha256'], hash);

      // Update patch_strip if it exists and patches are present
      if (patchFragments.length > 0) {
        const patchStripFragment = rule.children.patch_strip;
        if (patchStripFragment?.type === 'string') {
          logger.debug(
            `Found patch_strip value: ${patchStripFragment.value} for ${rule.value}`,
          );
          // Keep existing patch_strip value - no need to update unless specifically requested
        }
      }
    }
  }

  const results: UpdateArtifactsResult[] = [];

  // Add main package file if it changed
  if (oldContents !== newContents) {
    results.push({
      file: {
        type: 'addition',
        path,
        contents: newContents,
      },
    });
  }

  // Add any updated patch files
  results.push(...artifactFiles);

  return results.length > 0 ? results : null;
}
