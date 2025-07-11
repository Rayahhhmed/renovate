import { z } from 'zod';
import type { PackageDependency } from '../../types';

export const packageRules = ['package', '_package'] as const;

export const PackageTarget = z
  .object({
    rule: z.enum(packageRules),
    name: z.string(),
    package_name: z.string(),
    package_version: z.string(),
    cpe: z.string().optional(),
  })
  .transform(
    ({
      rule,
      name,
      package_name: packageName,
      package_version: currentValue,
    }): PackageDependency[] => [
      {
        depType: rule,
        depName: name,
        packageName,
        currentValue,
        // No datasource specified - this should be configured via packageRules
        // to specify the appropriate datasource for each package
        skipReason: 'unsupported-datasource',
      },
    ],
  );
