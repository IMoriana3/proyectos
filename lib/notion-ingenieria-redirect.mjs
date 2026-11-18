/* Compatibility only. Atlas owns the engineering screen and its data. */
export const ENGINEERING_URL = 'https://maps-9rd.pages.dev/herramientas/radar-factiun#ingenieria';
const FIELDS = ['front','ficha','q','claim','company','technology','person','product','view','sort','luz'];

export function engineeringTarget(source) {
  const input = new URL(source, 'https://panel-im3.pages.dev');
  const target = new URL(ENGINEERING_URL);
  for (const field of FIELDS) {
    const value = input.searchParams.get(field);
    if (value) target.searchParams.set(field, value.slice(0, field === 'ficha' ? 160 : 300));
  }
  return target.href;
}
