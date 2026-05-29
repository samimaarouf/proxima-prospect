export function cleanOfferTitle(title: string): string {
  return title
    .replace(/#\w+/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
