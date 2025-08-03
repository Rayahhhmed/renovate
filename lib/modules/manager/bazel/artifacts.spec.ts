import crypto from 'node:crypto';
import { codeBlock } from 'common-tags';
import type { UpdateArtifact } from '../types';
import { convertBazelPatchPathToFilePath } from './artifacts';
import { updateArtifacts } from '.';
import * as httpMock from '~test/http-mock';
import { fs, partial } from '~test/util';

vi.mock('../../../util/fs');

describe('modules/manager/bazel/artifacts', () => {
  it('updates commit-based http archive', async () => {
    const inputHash =
      'f7a6ecfb8174a1dd4713ea3b21621072996ada7e8f1a69e6ae7581be137c6dd6';
    const input = codeBlock`
      http_archive(
        name="distroless",
        sha256="${inputHash}",
        strip_prefix="distroless-446923c3756ceeaa75888f52fcbdd48bb314fbf8",
        urls=["https://github.com/GoogleContainerTools/distroless/archive/446923c3756ceeaa75888f52fcbdd48bb314fbf8.tar.gz"]
      )
    `;

    const currentDigest = '446923c3756ceeaa75888f52fcbdd48bb314fbf8';
    const newDigest = '033387ac8853e6cc1cd47df6c346bc53cbc490d8';
    const upgrade = {
      depName: 'distroless',
      depType: 'http_archive',
      repo: 'GoogleContainerTools/distroless',
      managerData: { idx: 0 },
      currentDigest,
      newDigest,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentDigest, newDigest)
      .replace(currentDigest, newDigest)
      .replace(inputHash, outputHash);

    httpMock
      .scope('https://github.com')
      .get(
        '/GoogleContainerTools/distroless/archive/033387ac8853e6cc1cd47df6c346bc53cbc490d8.tar.gz',
      )
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates http archive with content other then WORKSPACE', async () => {
    const inputHash =
      'eb5c57e4c12e68c0c20bc774bfbc60a568e800d025557bc4ea022c6479acc867';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.6.0",
        urls = ["https://github.com/bazelbuild/bazel-skylib/archive/0.6.0.tar.gz"],
      )
    `;

    const currentValue = '0.6.0';
    const newValue = '0.8.0';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.8.0.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates finds url instead of urls', async () => {
    const inputHash =
      'eb5c57e4c12e68c0c20bc774bfbc60a568e800d025557bc4ea022c6479acc867';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.6.0",
        url = "https://github.com/bazelbuild/bazel-skylib/archive/0.6.0.tar.gz",
      )
    `;

    const currentValue = '0.6.0';
    const newValue = '0.8.0';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);
    expect(output.indexOf('0.8.0')).not.toBe(-1);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.8.0.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('returns null if no urls resolve hashes', async () => {
    const inputHash =
      'eb5c57e4c12e68c0c20bc774bfbc60a568e800d025557bc4ea022c6479acc867';
    const input = codeBlock`
      http_archive(
        name = "bazel_skyfoo",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skyfoo-0.6.0",
        urls = ["https://github.com/bazelbuild/bazel-skyfoo/archive/0.6.0.tar.gz"],
      )
    `;

    const currentValue = '0.6.0';
    const newValue = '0.8.0';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skyfoo',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skyfoo/archive/0.8.0.tar.gz')
      .reply(500);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );
    expect(res).toBeNull();
  });

  it('errors for http_archive without urls', async () => {
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f",
        strip_prefix = "bazel-skylib-0.5.0",
      )
    `;

    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue: '0.5.0',
      newValue: '0.6.2',
    };
    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );
    expect(res).toBeNull();
  });

  it('errors for maybe(http_archive) without urls', async () => {
    const input = codeBlock`
      maybe(
        http_archive,
        name = "bazel_skylib",
        sha256 = "b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f",
        strip_prefix = "bazel-skylib-0.5.0",
      )
    `;

    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue: '0.5.0',
      newValue: '0.6.2',
    };
    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );
    expect(res).toBeNull();
  });

  it('errors for _http_archive without urls', async () => {
    const input = codeBlock`
      _http_archive(
        name = "bazel_skylib",
        sha256 = "b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f",
        strip_prefix = "bazel-skylib-0.5.0",
      )
    `;

    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue: '0.5.0',
      newValue: '0.6.2',
    };
    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );
    expect(res).toBeNull();
  });

  it('errors for maybe(_http_archive) without urls', async () => {
    const input = codeBlock`
      maybe(
        _http_archive,
        name = "bazel_skylib",
        sha256 = "b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f",
        strip_prefix = "bazel-skylib-0.5.0",
      )
    `;

    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue: '0.5.0',
      newValue: '0.6.2',
    };
    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );
    expect(res).toBeNull();
  });

  it('updates http_archive with urls array', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = [
          "https://mirror.bazel.build/github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
          "https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
        ],
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    httpMock
      .scope('https://mirror.bazel.build')
      .get('/github.com/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates maybe(http_archive) with urls array', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      maybe(
        http_archive,
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = [
            "https://mirror.bazel.build/github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
            "https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
        ],
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);
    httpMock
      .scope('https://mirror.bazel.build')
      .get('/github.com/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates _http_archive with urls array', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      _http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = [
          "https://mirror.bazel.build/github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
          "https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
        ],
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    httpMock
      .scope('https://mirror.bazel.build')
      .get('/github.com/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates maybe(_http_archive) with urls array', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      maybe(
        _http_archive,
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = [
            "https://mirror.bazel.build/github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
            "https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz",
        ],
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);
    httpMock
      .scope('https://mirror.bazel.build')
      .get('/github.com/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates one http_archive alongside others', async () => {
    const inputHash =
      '5aef09ed3279aa01d5c928e3beb248f9ad32dde6aafe6373a8c994c3ce643064';
    const other_http_archive = codeBlock`
      http_archive(
          name = "aspect_rules_js",
          sha256 = "db9f446752fe4100320cf8487e8fd476b9af0adf6b99b601bcfd70b289bb0598",
          strip_prefix = "rules_js-1.1.2",
          url = "https://github.com/aspect-build/rules_js/archive/refs/tags/v1.1.2.tar.gz",
      )
    `;
    const upgraded_http_archive = codeBlock`
      http_archive(
          name = "rules_nodejs",
          sha256 = "${inputHash}",
          urls = ["https://github.com/bazelbuild/rules_nodejs/releases/download/5.5.3/rules_nodejs-core-5.5.3.tar.gz"],
      )
    `;

    const input = `${other_http_archive}\n${upgraded_http_archive}`;

    const currentValue = '5.5.3';
    const newValue = '5.5.4';
    const upgrade = {
      depName: 'rules_nodejs',
      depType: 'http_archive',
      repo: 'bazelbuild/rules_nodejs',
      managerData: { idx: 1 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    httpMock
      .scope('https://github.com')
      .get(
        '/bazelbuild/rules_nodejs/releases/download/5.5.4/rules_nodejs-core-5.5.4.tar.gz',
      )
      .reply(200, tarContent);

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('updates one http_archive alongside others with matching versions', async () => {
    const inputHash =
      '5aef09ed3279aa01d5c928e3beb248f9ad32dde6aafe6373a8c994c3ce643064';

    const other_http_archive = codeBlock`
    http_archive(
        name = "aspect_rules_js",
        sha256 = "db9f446752fe4100320cf8487e8fd476b9af0adf6b99b601bcfd70b289bb0598",
        strip_prefix = "rules_js-1.1.2",
        url = "https://github.com/aspect-build/rules_js/archive/refs/tags/v1.1.2.tar.gz",
    )`;

    const upgraded_http_archive = codeBlock`
    http_archive(
        name = "rules_nodejs",
        sha256 = "${inputHash}",
        urls = ["https://github.com/bazelbuild/rules_nodejs/releases/download/1.1.2/rules_nodejs-core-1.1.2.tar.gz"],
    )
  `;

    const input = `${other_http_archive}\n${upgraded_http_archive}`;

    const currentValue = '1.1.2';
    const newValue = '1.2.3';
    const upgrade = {
      depName: 'rules_nodejs',
      depType: 'http_archive',
      repo: 'bazelbuild/rules_nodejs',
      managerData: { idx: 1 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    httpMock
      .scope('https://github.com')
      .get(
        '/bazelbuild/rules_nodejs/releases/download/1.2.3/rules_nodejs-core-1.2.3.tar.gz',
      )
      .reply(200, tarContent);

    const output = input
      .replace(
        `${currentValue}/rules_nodejs-core-${currentValue}`,
        `${newValue}/rules_nodejs-core-${newValue}`,
      )
      .replace(inputHash, outputHash);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('migrates rules_webtesting URL format', async () => {
    const inputHash =
      'e9abb7658b6a129740c0b3ef6f5a2370864e102a5ba5ffca2cea565829ed825a';
    const input = codeBlock`
      http_archive(
          name = "io_bazel_rules_webtesting",
          sha256 = "${inputHash}",
          urls = ["https://github.com/bazelbuild/rules_webtesting/releases/download/0.3.5/rules_webtesting.tar.gz"],
      )
    `;

    const currentValue = '0.3.5';
    const newValue = '0.4.1';
    const upgrade = {
      depName: 'io_bazel_rules_webtesting',
      depType: 'http_archive',
      repo: 'bazelbuild/rules_webtesting',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const output = codeBlock`
      http_archive(
          name = "io_bazel_rules_webtesting",
          sha256 = "${outputHash}",
          urls = ["https://github.com/bazelbuild/rules_webtesting/releases/download/0.4.1/rules_webtesting-0.4.1.tar.gz"],
      )
    `;

    httpMock
      .scope('https://github.com')
      .get(
        '/bazelbuild/rules_webtesting/releases/download/0.4.1/rules_webtesting-0.4.1.tar.gz',
      )
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);
  });

  it('handles http_archive with valid patches', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = ["https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz"],
        patches = ["//:skylib.patch"],
        patch_strip = 1,
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const patchContent = codeBlock`
      --- a/old_file.txt
      +++ b/new_file.txt
      @@ -1,3 +1,3 @@
       line1
      -old_line
      +new_line
       line3
    `;

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    fs.readLocalFile.mockResolvedValueOnce(patchContent);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);

    expect(fs.readLocalFile).toHaveBeenCalledWith('.///:skylib.patch');
  });

  it('skips update for http_archive with invalid patches', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = ["https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz"],
        patches = ["//:invalid.patch"],
        patch_strip = 1,
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const invalidPatchContent = 'This is not a valid patch file';

    fs.readLocalFile.mockResolvedValueOnce(invalidPatchContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toBeNull();
    expect(fs.readLocalFile).toHaveBeenCalledWith('.///:invalid.patch');
  });

  it('skips update for http_archive with missing patch files', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = ["https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz"],
        patches = ["//:missing.patch"],
        patch_strip = 1,
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    fs.readLocalFile.mockResolvedValueOnce(null);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toBeNull();
    expect(fs.readLocalFile).toHaveBeenCalledWith('.///:missing.patch');
  });

  it('handles http_archive with multiple patches', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      http_archive(
        name = "bazel_skylib",
        sha256 = "${inputHash}",
        strip_prefix = "bazel-skylib-0.5.0",
        urls = ["https://github.com/bazelbuild/bazel-skylib/archive/0.5.0.tar.gz"],
        patches = ["//:patch1.patch", "//:patch2.patch"],
        patch_strip = 1,
      )
    `;

    const currentValue = '0.5.0';
    const newValue = '0.6.2';
    const upgrade = {
      depName: 'bazel_skylib',
      depType: 'http_archive',
      repo: 'bazelbuild/bazel-skylib',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const patchContent1 = codeBlock`
      --- a/file1.txt
      +++ b/file1.txt
      @@ -1,2 +1,2 @@
      -old content 1
      +new content 1
    `;

    const patchContent2 = codeBlock`
      --- a/file2.txt
      +++ b/file2.txt
      @@ -1,2 +1,2 @@
      -old content 2
      +new content 2
    `;

    const output = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    fs.readLocalFile
      .mockResolvedValueOnce(patchContent1)
      .mockResolvedValueOnce(patchContent2);

    httpMock
      .scope('https://github.com')
      .get('/bazelbuild/bazel-skylib/archive/0.6.2.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: output,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
    ]);

    expect(fs.readLocalFile).toHaveBeenCalledWith('.///:patch1.patch');
    expect(fs.readLocalFile).toHaveBeenCalledWith('.///:patch2.patch');
  });

  it('updates package_version in patch files', async () => {
    const inputHash =
      'b5f6abe419da897b7901f90cbab08af958b97a8f3575b0d3dd062ac7ce78541f';
    const input = codeBlock`
      http_archive(
        name = "libheif",
        sha256 = "${inputHash}",
        strip_prefix = "libheif-1.18.2",
        urls = ["https://github.com/strukturag/libheif/archive/v1.18.2.tar.gz"],
        patches = ["//:libheif.patch"],
        patch_strip = 1,
      )
    `;

    const currentValue = '1.18.2';
    const newValue = '1.19.0';
    const upgrade = {
      depName: 'libheif',
      depType: 'http_archive',
      repo: 'strukturag/libheif',
      managerData: { idx: 0 },
      currentValue,
      newValue,
    };

    const tarContent = Buffer.from('foo');
    const outputHash = crypto
      .createHash('sha256')
      .update(tarContent)
      .digest('hex');

    const patchContent = codeBlock`
      From: Author <author@example.com>
      Date: Thu, 1 Jan 1970 00:00:00 +0000
      Subject: [PATCH] add build file

      ---
       BUILD.bazel | 63 +++++++++++++++++++++++++++++++++++++++++++++++++++++
       1 file changed, 63 insertions(+)
       create mode 100644 BUILD.bazel

      diff --git a/BUILD.bazel b/BUILD.bazel
      new file mode 100644
      index 0000000..f8f2d8e
      --- /dev/null
      +++ b/BUILD.bazel
      @@ -0,0 +1,25 @@
      +load("@rules_license//rules:package_info.bzl", "package_info")
      +
      +package_info(
      +    name = "package_info",
      +    package_name = "libheif",
      +    cpe = "cpe:2.3:a:struktur:libheif",
      +    package_version = "1.18.2",
      +)
      --
      2.49.0
    `;

    const expectedPatchContent = codeBlock`
      From: Author <author@example.com>
      Date: Thu, 1 Jan 1970 00:00:00 +0000
      Subject: [PATCH] add build file

      ---
       BUILD.bazel | 63 +++++++++++++++++++++++++++++++++++++++++++++++++++++
       1 file changed, 63 insertions(+)
       create mode 100644 BUILD.bazel

      diff --git a/BUILD.bazel b/BUILD.bazel
      new file mode 100644
      index 0000000..f8f2d8e
      --- /dev/null
      +++ b/BUILD.bazel
      @@ -0,0 +1,25 @@
      +load("@rules_license//rules:package_info.bzl", "package_info")
      +
      +package_info(
      +    name = "package_info",
      +    package_name = "libheif",
      +    cpe = "cpe:2.3:a:struktur:libheif",
      +    package_version = "1.19.0",
      +)
      --
      2.49.0
    `;

    const expectedOutput = input
      .replace(currentValue, newValue)
      .replace(currentValue, newValue)
      .replace(inputHash, outputHash);

    fs.readLocalFile.mockResolvedValueOnce(patchContent);

    httpMock
      .scope('https://github.com')
      .get('/strukturag/libheif/archive/v1.19.0.tar.gz')
      .reply(200, tarContent);

    const res = await updateArtifacts(
      partial<UpdateArtifact>({
        packageFileName: 'WORKSPACE',
        updatedDeps: [upgrade],
        newPackageFileContent: input,
      }),
    );

    expect(res).toEqual([
      {
        file: {
          contents: expectedOutput,
          path: 'WORKSPACE',
          type: 'addition',
        },
      },
      {
        file: {
          contents: expectedPatchContent,
          path: 'libheif.patch',
          type: 'addition',
        },
      },
    ]);

    expect(fs.readLocalFile).toHaveBeenCalledWith('.///:libheif.patch');
  });

  it('converts bazel path to file path', () => {
    expect(
      convertBazelPatchPathToFilePath('//:third_party/libheif/libheif.patch'),
    ).toBe('third_party/libheif/libheif.patch');
    expect(
      convertBazelPatchPathToFilePath('//third_party/libheif/libheif.patch'),
    ).toBe('third_party/libheif/libheif.patch');
  });
});
