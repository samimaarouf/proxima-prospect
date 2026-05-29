import { ROLE_CATEGORIES, type RoleCategoryKey } from "$lib/server/linkedin/roleCategories";

export function buildRoleQuery(roles: RoleCategoryKey[]): string {
  return roles
    .map((role) => {
      const cat = ROLE_CATEGORIES[role];
      if (!cat) return "";
      const examples = cat.keywords.slice(0, 10).join(", ");
      return `${cat.label} (ex. ${examples})`;
    })
    .filter(Boolean)
    .join(" ; ");
}
