// Rules the schema cannot express: they compare one part of a kit with another.

import type { Kit } from './contract.ts';
import type { KitIssue } from './issues.ts';

export function kitIssues(kit: Kit): KitIssue[] {
  const issues: KitIssue[] = [];
  const seen = new Set<string>();
  const known = new Set(
    kit.components.flatMap((component) => [component.name, ...component.parts]),
  );

  for (const component of kit.components) {
    const at = `components.${component.name}`;
    if (seen.has(component.name)) {
      issues.push({
        path: at,
        key: 'kitIssue.duplicateComponent',
        params: { name: component.name },
      });
    }
    seen.add(component.name);

    for (const prop of component.props) {
      if (prop.type !== 'enum') continue;
      const params = { component: component.name, prop: prop.name };
      const path = `${at}.props.${prop.name}`;
      if (!prop.values?.length) {
        issues.push({ path, key: 'kitIssue.enumWithoutValues', params });
      } else if (prop.default !== undefined && !prop.values.includes(String(prop.default))) {
        issues.push({
          path,
          key: 'kitIssue.defaultNotInValues',
          params: { ...params, value: String(prop.default) },
        });
      }
    }

    for (const example of component.examples) {
      for (const name of example.imports) {
        if (known.has(name)) continue;
        issues.push({
          path: `${at}.examples`,
          key: 'kitIssue.unknownImport',
          params: { component: component.name, name },
        });
      }
    }
  }

  if (kit.icons?.source === 'component' && !seen.has(kit.icons.component)) {
    issues.push({
      path: 'icons.component',
      key: 'kitIssue.iconComponentMissing',
      params: { name: kit.icons.component },
    });
  }
  return issues;
}
