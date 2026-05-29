import { getUnipileService, type UnipileLinkedInPerson } from "$lib/services/UnipileService";

const PAGE_SIZE = 50;
const DEFAULT_MAX_EMPLOYEES = 300;

export async function fetchCompanyEmployees(params: {
  accountId: string;
  companyId: string;
  locationId?: string | null;
  maxEmployees?: number;
}): Promise<UnipileLinkedInPerson[]> {
  const unipile = getUnipileService();
  const maxEmployees = params.maxEmployees ?? DEFAULT_MAX_EMPLOYEES;

  const fetchPages = async (withLocation: boolean): Promise<UnipileLinkedInPerson[]> => {
    const collected: UnipileLinkedInPerson[] = [];
    let cursor: string | undefined;

    while (collected.length < maxEmployees) {
      const response = await unipile.searchLinkedInPeople(params.accountId, {
        company: [params.companyId],
        location: withLocation && params.locationId ? [params.locationId] : undefined,
        limit: PAGE_SIZE,
        cursor,
      });

      const page = response.items ?? [];
      if (!page.length) break;

      collected.push(...page);
      cursor = response.cursor ?? undefined;
      if (!cursor) break;
    }

    return collected.slice(0, maxEmployees);
  };

  if (params.locationId) {
    const withLocation = await fetchPages(true);
    if (withLocation.length > 0) return withLocation;
    console.log(
      `[fetchCompanyEmployees] 0 hits with location=${params.locationId}, retrying without location filter`,
    );
  }

  return fetchPages(false);
}
