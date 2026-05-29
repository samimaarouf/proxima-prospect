import { fetchCompanyWeakSignals } from "./fetchCompanyWeakSignals";
import { fetchOfferContextSignal } from "./fetchOfferContextSignal";
import type { PersonalizationSignal } from "./types";

export async function fetchCompanySignals(params: {
  companyName: string;
  offerTitle: string;
  offerLocation?: string | null;
  offerExcerpt?: string;
}): Promise<PersonalizationSignal[]> {
  const [offerSignal, weakSignals] = await Promise.all([
    fetchOfferContextSignal(params),
    fetchCompanyWeakSignals(params),
  ]);

  return [...(offerSignal ? [offerSignal] : []), ...weakSignals];
}
